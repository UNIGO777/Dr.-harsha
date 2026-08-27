#!/usr/bin/env node
/**
 * Restore an encrypted backup created by scripts/backup.js.
 *
 *   node scripts/restore.js --file backups/db-2026-08-28T02-00.archive.gz.enc --yes
 *
 * Options:
 *   --file <path>    encrypted archive (required). To restore from the bucket,
 *                    download the object first (any S3 browser / CLI works).
 *   --uri <uri>      target MongoDB URI (default: MONGODB_URI from .env)
 *   --drop           drop existing collections before restoring (DESTRUCTIVE)
 *   --yes            required — confirms you really want to restore
 *   --out <path>     just decrypt+decompress to this file and stop (no DB write);
 *                    lets you inspect a backup or restore manually
 *
 * An untested backup is not a backup — run this against a scratch database
 * (e.g. a local mongod or a throwaway Atlas cluster) once a month:
 *   node scripts/restore.js --file <latest> --uri mongodb://localhost:27017/restore_drill --yes
 */

import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function parseArgs() {
  const args = { drop: false, yes: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i] === "--uri") args.uri = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--drop") args.drop = true;
    else if (argv[i] === "--yes") args.yes = true;
  }
  return args;
}

function log(message) {
  console.log(`[restore] ${message}`);
}

function runMongorestore(uri, archiveFile, drop) {
  return new Promise((resolve, reject) => {
    const flags = [`--uri=${uri}`, `--archive=${archiveFile}`, "--gzip"];
    if (drop) flags.push("--drop");
    const child = spawn("mongorestore", flags, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`mongorestore exited ${code}`))));
  });
}

async function restoreEjsonl(uri, plainGunzipped, drop) {
  const { default: mongoose } = await import("mongoose");
  const { EJSON } = mongoose.mongo.BSON;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;

  const lines = plainGunzipped.toString("utf8").split("\n").filter(Boolean);
  const byCollection = new Map();
  for (const line of lines) {
    const { c, d } = JSON.parse(line);
    if (!byCollection.has(c)) byCollection.set(c, []);
    byCollection.get(c).push(EJSON.deserialize(d));
  }

  for (const [name, docs] of byCollection) {
    if (drop) await db.collection(name).drop().catch(() => {});
    // Insert in chunks; skip duplicates so re-runs don't explode
    for (let i = 0; i < docs.length; i += 500) {
      await db.collection(name).insertMany(docs.slice(i, i + 500), { ordered: false }).catch((err) => {
        if (err?.code !== 11000 && !String(err?.message).includes("E11000")) throw err;
      });
    }
    log(`${name}: ${docs.length} documents`);
  }
  await mongoose.disconnect();
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim().toLowerCase() === "yes";
}

async function main() {
  const args = parseArgs();
  if (!args.file) {
    console.error('Usage: node scripts/restore.js --file <archive.enc> [--uri <target>] [--drop] [--out <path>] --yes');
    process.exit(1);
  }

  const { decryptBuffer } = await import("./backup.js");
  const crypto = await import("node:crypto");

  const raw = (process.env.BACKUP_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not set — cannot decrypt");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : crypto.scryptSync(raw, "drharsha-backup-v1", 32);

  log(`decrypting ${args.file}…`);
  const encrypted = await fsp.readFile(args.file);
  const plain = decryptBuffer(encrypted, key); // GCM auth tag also verifies integrity
  log(`decrypted ${(plain.length / 1024 / 1024).toFixed(2)} MB (integrity verified)`);

  const isEjsonl = args.file.includes(".ejsonl.");

  if (args.out) {
    const output = isEjsonl ? zlib.gunzipSync(plain) : plain;
    await fsp.writeFile(args.out, output);
    log(`written to ${args.out}${isEjsonl ? " (EJSON lines)" : " (mongodump gzip archive — use mongorestore --archive --gzip)"}`);
    return;
  }

  const uri = args.uri || process.env.MONGODB_URI || process.env.MONGO_URI || "";
  if (!uri) throw new Error("No target URI — pass --uri or set MONGODB_URI");

  const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split("/")[0];
  log(`TARGET: ${host}${args.drop ? "  (existing collections will be DROPPED)" : ""}`);
  if (!args.yes) {
    const ok = await confirm('Type "yes" to restore into this database: ');
    if (!ok) {
      log("aborted");
      process.exit(1);
    }
  }

  if (isEjsonl) {
    await restoreEjsonl(uri, zlib.gunzipSync(plain), args.drop);
  } else {
    // mongodump archive: hand the decrypted (still gzipped) archive to mongorestore
    const tmp = path.join(PROJECT_ROOT, `.tmp-restore-${process.pid}.archive.gz`);
    await fsp.writeFile(tmp, plain);
    try {
      await runMongorestore(uri, tmp, args.drop);
    } finally {
      await fsp.unlink(tmp).catch(() => {});
    }
  }
  log("RESTORE COMPLETE");
}

main().catch((err) => {
  console.error(`[restore] FAILED — ${err?.message || err}`);
  process.exit(1);
});
