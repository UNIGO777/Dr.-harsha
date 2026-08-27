#!/usr/bin/env node
/**
 * Daily encrypted database + uploads backup.
 *
 * Pipeline:
 *   1. Dump MongoDB   — mongodump --archive --gzip (falls back to a pure-Node
 *                       Extended-JSON export when mongodump is not installed)
 *   2. Encrypt        — AES-256-GCM with BACKUP_ENCRYPTION_KEY
 *   3. Store          — local BACKUP_DIR, plus S3-compatible offsite bucket
 *                       (AWS S3 / Cloudflare R2 / Backblaze B2) when configured
 *   4. Uploads sync   — encrypts and uploads any uploads/ file the bucket does
 *                       not have yet (incremental; filenames are immutable)
 *   5. Retention      — keeps BACKUP_RETAIN_DAILY dailies; the first backup of
 *                       each month is kept for BACKUP_RETAIN_MONTHLY months
 *   6. Record         — writes a BackupRun row (feeds the dashboard alert) and
 *                       emails BACKUP_ALERT_EMAIL on failure
 *
 * Run manually:  npm run backup
 * Run daily:     BACKUP_ENABLED=true in .env (in-process scheduler), or cron:
 *                0 2 * * * cd /path/to/Dr.-harsha && npm run backup
 *
 * Env (see .env):
 *   BACKUP_ENCRYPTION_KEY   required — 64 hex chars. LOSING THIS KEY MAKES
 *                           EVERY BACKUP UNREADABLE. Store a copy outside the server.
 *   BACKUP_DIR              local folder for encrypted archives (default ./backups)
 *   BACKUP_RETAIN_DAILY     default 30
 *   BACKUP_RETAIN_MONTHLY   default 24
 *   BACKUP_INCLUDE_UPLOADS  default true (needs S3 config to be useful)
 *   BACKUP_ALERT_EMAIL      failure alert recipient (uses existing SMTP config)
 *   BACKUP_S3_ENDPOINT / BACKUP_S3_REGION / BACKUP_S3_BUCKET /
 *   BACKUP_S3_ACCESS_KEY / BACKUP_S3_SECRET_KEY / BACKUP_S3_PREFIX
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const MAGIC = Buffer.from("DRHBKP1"); // file format marker: MAGIC | IV(12) | TAG(16) | ciphertext

function log(message) {
  console.log(`[backup] ${new Date().toISOString()} ${message}`);
}

function getEncryptionKey() {
  const raw = (process.env.BACKUP_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not set — refusing to write an unencrypted backup");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  // Passphrase fallback — derive a key deterministically
  return crypto.scryptSync(raw, "drharsha-backup-v1", 32);
}

export function encryptBuffer(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBuffer(payload, key) {
  if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a Dr.Harsha backup file (bad header)");
  }
  const iv = payload.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = payload.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const ciphertext = payload.subarray(MAGIC.length + 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function getS3Config() {
  const endpoint = (process.env.BACKUP_S3_ENDPOINT || "").trim();
  if (!endpoint) return null;
  return {
    endpoint,
    region: (process.env.BACKUP_S3_REGION || "auto").trim(),
    bucket: (process.env.BACKUP_S3_BUCKET || "").trim(),
    accessKey: (process.env.BACKUP_S3_ACCESS_KEY || "").trim(),
    secretKey: (process.env.BACKUP_S3_SECRET_KEY || "").trim(),
    prefix: (process.env.BACKUP_S3_PREFIX || "drharsha-backups").trim().replace(/\/+$/, "")
  };
}

/* ── Dump ──────────────────────────────────────────────────────────── */

function runMongodump(uri, outFile) {
  return new Promise((resolve, reject) => {
    const child = spawn("mongodump", [`--uri=${uri}`, "--archive=" + outFile, "--gzip"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => reject(err)); // ENOENT → caller falls back
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mongodump exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Pure-Node fallback: every collection exported as Extended JSON lines
 * ({"c": collection, "d": document} per line), gzipped. Preserves ObjectIds,
 * dates and binary via EJSON. Restored by scripts/restore.js.
 */
async function exportWithDriver(outFile) {
  const { EJSON } = mongoose.mongo.BSON;
  const db = mongoose.connection.db;
  const collections = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."));

  const gzip = zlib.createGzip({ level: 6 });
  const sink = fs.createWriteStream(outFile);
  const done = new Promise((resolve, reject) => {
    sink.on("finish", resolve);
    sink.on("error", reject);
    gzip.on("error", reject);
  });
  gzip.pipe(sink);

  const write = (line) =>
    new Promise((resolve) => {
      if (!gzip.write(line)) gzip.once("drain", resolve);
      else resolve();
    });

  let docCount = 0;
  for (const name of collections) {
    const cursor = db.collection(name).find({});
    for await (const doc of cursor) {
      await write(JSON.stringify({ c: name, d: EJSON.serialize(doc) }) + "\n");
      docCount += 1;
    }
  }
  gzip.end();
  await done;
  log(`driver export: ${collections.length} collections, ${docCount} documents`);
}

/* ── Uploads sync ──────────────────────────────────────────────────── */

async function walkFiles(dir, baseDir = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full, baseDir)));
    else if (entry.isFile()) files.push(path.relative(baseDir, full));
  }
  return files;
}

async function syncUploads(s3, key) {
  const uploadsDir = path.join(PROJECT_ROOT, "uploads");
  const files = await walkFiles(uploadsDir);
  if (files.length === 0) return { synced: 0, skipped: 0 };

  const prefix = `${s3.prefix}/uploads/`;
  const existing = new Set((await s3.client.listObjects(prefix)).map((obj) => obj.key));

  let synced = 0;
  let skipped = 0;
  for (const relative of files) {
    // Upload filenames are timestamped+hashed (immutable), so key presence is
    // enough to skip — no content comparison needed.
    const remoteKey = `${prefix}${relative.split(path.sep).join("/")}.enc`;
    if (existing.has(remoteKey)) {
      skipped += 1;
      continue;
    }
    const content = await fsp.readFile(path.join(uploadsDir, relative));
    await s3.client.putObject(remoteKey, encryptBuffer(content, key));
    synced += 1;
  }
  return { synced, skipped };
}

/* ── Retention ─────────────────────────────────────────────────────── */

function shouldKeep(fileDate, now, retainDaily, retainMonthly) {
  const ageDays = (now - fileDate) / (24 * 60 * 60 * 1000);
  if (ageDays <= retainDaily) return true;
  // The first backup of a month stands in for that month
  if (fileDate.getDate() === 1) {
    const ageMonths = (now.getFullYear() - fileDate.getFullYear()) * 12 + (now.getMonth() - fileDate.getMonth());
    return ageMonths <= retainMonthly;
  }
  return false;
}

function parseArchiveDate(name) {
  const match = name.match(/db-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

async function applyLocalRetention(backupDir, retainDaily, retainMonthly) {
  const now = new Date();
  const files = await fsp.readdir(backupDir).catch(() => []);
  let removed = 0;
  for (const name of files) {
    const fileDate = parseArchiveDate(name);
    if (!fileDate) continue;
    if (!shouldKeep(fileDate, now, retainDaily, retainMonthly)) {
      await fsp.unlink(path.join(backupDir, name)).catch(() => {});
      removed += 1;
    }
  }
  return removed;
}

async function applyRemoteRetention(s3, retainDaily, retainMonthly) {
  const now = new Date();
  const objects = await s3.client.listObjects(`${s3.prefix}/db/`);
  let removed = 0;
  for (const obj of objects) {
    const fileDate = parseArchiveDate(path.basename(obj.key));
    if (!fileDate) continue;
    if (!shouldKeep(fileDate, now, retainDaily, retainMonthly)) {
      await s3.client.deleteObject(obj.key);
      removed += 1;
    }
  }
  return removed;
}

/* ── Main ──────────────────────────────────────────────────────────── */

async function runBackup() {
  const startedAt = new Date();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
  if (!uri) throw new Error("MONGODB_URI is not set");

  const key = getEncryptionKey();
  const backupDir = path.resolve(PROJECT_ROOT, process.env.BACKUP_DIR || "backups");
  await fsp.mkdir(backupDir, { recursive: true });

  const retainDaily = parseInt(process.env.BACKUP_RETAIN_DAILY, 10) || 30;
  const retainMonthly = parseInt(process.env.BACKUP_RETAIN_MONTHLY, 10) || 24;
  const includeUploads = process.env.BACKUP_INCLUDE_UPLOADS !== "false";

  const stamp = startedAt.toISOString().slice(0, 16).replace(/:/g, "-");
  const tmpDump = path.join(backupDir, `.tmp-dump-${process.pid}`);

  // 1. Dump
  let dumpFormat = "mongodump-archive-gzip";
  try {
    log("running mongodump…");
    await runMongodump(uri, tmpDump);
  } catch (err) {
    if (err.code === "ENOENT") {
      log("mongodump not installed — using pure-Node EJSON export");
      dumpFormat = "ejsonl-gzip";
      await exportWithDriver(tmpDump);
    } else {
      throw err;
    }
  }

  // 2. Encrypt
  const archiveName = `db-${stamp}.${dumpFormat === "mongodump-archive-gzip" ? "archive.gz" : "ejsonl.gz"}.enc`;
  const archivePath = path.join(backupDir, archiveName);
  const plainDump = await fsp.readFile(tmpDump);
  await fsp.unlink(tmpDump).catch(() => {});
  const encrypted = encryptBuffer(plainDump, key);
  await fsp.writeFile(archivePath, encrypted);
  const checksum = crypto.createHash("sha256").update(encrypted).digest("hex");
  log(`encrypted archive: ${archiveName} (${(encrypted.length / 1024 / 1024).toFixed(2)} MB)`);

  // 3. Offsite
  const locations = [archivePath];
  const s3Config = getS3Config();
  let uploadsResult = null;
  if (s3Config) {
    const { createS3Client } = await import("../src/utils/s3Lite.js");
    const s3 = { ...s3Config, client: createS3Client(s3Config) };
    const remoteKey = `${s3.prefix}/db/${archiveName}`;
    log(`uploading to ${s3Config.endpoint}/${s3Config.bucket}/${remoteKey}…`);
    await s3.client.putObject(remoteKey, encrypted);
    locations.push(`s3://${s3Config.bucket}/${remoteKey}`);

    if (includeUploads) {
      log("syncing uploads/ …");
      uploadsResult = await syncUploads(s3, key);
      log(`uploads: ${uploadsResult.synced} new, ${uploadsResult.skipped} already offsite`);
    }

    const remoteRemoved = await applyRemoteRetention(s3, retainDaily, retainMonthly);
    if (remoteRemoved) log(`remote retention: removed ${remoteRemoved} old archives`);
  } else {
    log("WARNING: no BACKUP_S3_ENDPOINT — backup exists only on this machine, which is not a real offsite backup");
  }

  // 4. Local retention
  const localRemoved = await applyLocalRetention(backupDir, retainDaily, retainMonthly);
  if (localRemoved) log(`local retention: removed ${localRemoved} old archives`);

  return {
    startedAt,
    sizeBytes: encrypted.length,
    checksum,
    location: locations.join(" | "),
    dumpFormat,
    uploadsResult
  };
}

async function recordRun({ status, startedAt, result = {}, error = "" }) {
  try {
    const { BackupRun } = await import("../src/Models/BackupRun.js");
    await BackupRun.create({
      startedAt,
      finishedAt: new Date(),
      status,
      sizeBytes: result.sizeBytes || 0,
      location: result.location || "",
      checksum: result.checksum || "",
      error: String(error).slice(0, 1000)
    });
  } catch (recordErr) {
    log(`could not record BackupRun row: ${recordErr.message}`);
  }
}

async function sendFailureAlert(error) {
  const toEmail = (process.env.BACKUP_ALERT_EMAIL || "").trim();
  if (!toEmail) return;
  try {
    const { sendPlainNotificationEmail } = await import("../src/utils/emailService.js");
    await sendPlainNotificationEmail({
      toEmail,
      subject: "🔴 Dr. Harsha portal — database backup FAILED",
      body: `The automated backup failed at ${new Date().toISOString()}.\n\nError: ${error?.message || error}\n\nCheck the server and run "npm run backup" manually once the issue is fixed.`
    });
    log(`failure alert sent to ${toEmail}`);
  } catch (mailErr) {
    log(`could not send failure alert: ${mailErr.message}`);
  }
}

async function main() {
  const startedAt = new Date();
  let dbConnected = false;
  try {
    const { connectDb } = await import("../src/utils/connectDb.js");
    const dbResult = await connectDb();
    dbConnected = !!dbResult.connected;
    if (!dbConnected) throw new Error(`MongoDB connection failed: ${dbResult.reason || "unknown"}`);

    const result = await runBackup();
    await recordRun({ status: "success", startedAt, result });
    log(`SUCCESS — ${result.location}`);
    process.exit(0);
  } catch (err) {
    log(`FAILED — ${err?.message || err}`);
    if (dbConnected) await recordRun({ status: "failed", startedAt, error: err?.message || String(err) });
    await sendFailureAlert(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

// Only run when invoked directly (restore.js imports the crypto helpers)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
