#!/usr/bin/env node
/**
 * Check whether an SMTP mailbox can actually deliver mail.
 *
 * Providers can accept the connection, the login, the sender and the recipient
 * and still refuse the message at the very end — Hostinger's
 * "554 Outbound sending is disabled for this account" does exactly that. So a
 * connection test proves nothing: this script runs the full conversation and
 * reports the stage that fails.
 *
 *   npm run test:mail                      # test the primary SMTP_* config
 *   npm run test:mail -- --fallback        # test the SMTP_FALLBACK_* config
 *   npm run test:mail -- --send you@x.com  # actually deliver a test email
 *
 * Without --send nothing is delivered: the session stops before the message body.
 */

import net from "node:net";
import tls from "node:tls";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const args = process.argv.slice(2);
const useFallback = args.includes("--fallback");
const sendTo = args.includes("--send") ? args[args.indexOf("--send") + 1] : null;

const prefix = useFallback ? "SMTP_FALLBACK_" : "SMTP_";
const cfg = {
  host: process.env[`${prefix}HOST`] || "",
  port: Number(process.env[`${prefix}PORT`] || 587),
  secure: String(process.env[`${prefix}SECURE`] || "").toLowerCase() === "true",
  user: process.env[`${prefix}USER`] || "",
  pass: process.env[`${prefix}PASS`] || ""
};
const fromHeader = useFallback
  ? process.env.SMTP_FALLBACK_FROM || process.env.EMAIL_FROM || cfg.user
  : process.env.EMAIL_FROM || cfg.user;
const fromAddress = String(fromHeader).match(/<([^>]+)>/)?.[1] || fromHeader;

if (!cfg.host || !cfg.user || !cfg.pass) {
  console.error(`✖ ${prefix}HOST / ${prefix}USER / ${prefix}PASS are not all set in .env`);
  process.exit(2);
}

function conversation(socket) {
  let buffer = "";
  const waiting = [];
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    const complete = buffer.match(/^(?:\d{3}-[^\n]*\n)*(\d{3}) [^\n]*\r?\n$/);
    if (complete && waiting.length) {
      waiting.shift()({ code: Number(complete[1]), text: buffer.trim() });
      buffer = "";
    }
  });
  return {
    read: () => new Promise((resolve) => waiting.push(resolve)),
    send: (line) => socket.write(line + "\r\n")
  };
}

function fail(stage, reply) {
  console.log(`\n✖ FAILED at ${stage}`);
  console.log(`  ${reply.text.split("\n").pop()}`);
  if (/outbound sending is disabled|5\.7\.1/i.test(reply.text)) {
    console.log("\n  The provider has disabled sending for this account.");
    console.log("  Nothing in this codebase can bypass that — either get the block");
    console.log("  lifted, or point SMTP_FALLBACK_* at a different provider.");
  }
  process.exit(1);
}

async function main() {
  console.log(`Testing ${useFallback ? "FALLBACK" : "PRIMARY"} mail config`);
  console.log(`  host : ${cfg.host}:${cfg.port}`);
  console.log(`  user : ${cfg.user}`);
  console.log(`  from : ${fromAddress}\n`);

  const socket = cfg.secure
    ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
    : net.createConnection({ host: cfg.host, port: cfg.port });
  socket.setTimeout(25000);
  socket.on("timeout", () => { console.error("✖ timed out"); process.exit(1); });
  socket.on("error", (err) => { console.error(`✖ connection error: ${err.message}`); process.exit(1); });

  await new Promise((resolve) => socket.once(cfg.secure ? "secureConnect" : "connect", resolve));
  let io = conversation(socket);
  await io.read();
  console.log("connect      ✓");

  io.send("EHLO mailtest.local");
  await io.read();

  let active = socket;
  if (!cfg.secure) {
    io.send("STARTTLS");
    const starttls = await io.read();
    if (starttls.code !== 220) fail("STARTTLS", starttls);
    const secure = tls.connect({ socket, servername: cfg.host });
    await new Promise((resolve) => secure.once("secureConnect", resolve));
    active = secure;
    io = conversation(secure);
    io.send("EHLO mailtest.local");
    await io.read();
    console.log("STARTTLS     ✓");
  }

  io.send("AUTH LOGIN");
  await io.read();
  io.send(Buffer.from(cfg.user).toString("base64"));
  await io.read();
  io.send(Buffer.from(cfg.pass).toString("base64"));
  const auth = await io.read();
  if (auth.code !== 235) fail("AUTH (wrong username or password?)", auth);
  console.log("auth         ✓");

  const recipient = sendTo || cfg.user;
  io.send(`MAIL FROM:<${fromAddress}>`);
  const mailFrom = await io.read();
  if (mailFrom.code !== 250) fail("MAIL FROM (is this address allowed to send?)", mailFrom);
  console.log("sender       ✓");

  io.send(`RCPT TO:<${recipient}>`);
  const rcpt = await io.read();
  if (rcpt.code !== 250) fail("RCPT TO", rcpt);
  console.log("recipient    ✓");

  if (!sendTo) {
    io.send("RSET");
    await io.read();
    io.send("QUIT");
    console.log("\n⚠  Envelope accepted, but the message body was NOT submitted.");
    console.log("   Some providers only refuse at the final step, so this is not proof.");
    console.log(`   Run with --send ${cfg.user} to deliver a real test email.`);
    active.end();
    process.exit(0);
  }

  io.send("DATA");
  const data = await io.read();
  if (data.code !== 354) fail("DATA", data);

  const body = [
    `From: ${fromHeader}`,
    `To: <${recipient}>`,
    "Subject: Dr. Harsha portal - SMTP delivery test",
    "",
    "This test message confirms outbound email is working.",
    "If you received it, OTP login will work.",
    "."
  ].join("\r\n");
  io.send(body);
  const accepted = await io.read();
  if (accepted.code !== 250) fail("END-OF-DATA (the provider refused the message itself)", accepted);

  io.send("QUIT");
  console.log("delivery     ✓");
  console.log(`\n✅ WORKING — test email delivered to ${recipient}. Check that inbox.`);
  active.end();
  process.exit(0);
}

main().catch((err) => { console.error(`✖ ${err?.message || err}`); process.exit(1); });
