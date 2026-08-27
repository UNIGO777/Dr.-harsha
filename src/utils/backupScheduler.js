import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_SCRIPT = path.join(__dirname, "..", "..", "scripts", "backup.js");

let scheduled = null;
let running = false;

function log(message) {
  console.log(`[backup-scheduler] ${message}`);
}

function msUntilNextRun(hour, minute) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function runBackupProcess() {
  if (running) {
    log("previous backup still running — skipping this trigger");
    return;
  }
  running = true;
  log("starting backup process…");
  // Separate process: keeps dump memory out of the API server and survives
  // controller-level crashes. The script itself records the BackupRun row.
  const child = spawn(process.execPath, [BACKUP_SCRIPT], { stdio: ["ignore", "inherit", "inherit"] });
  child.on("error", (err) => {
    running = false;
    log(`could not start backup process: ${err.message}`);
  });
  child.on("close", (code) => {
    running = false;
    log(`backup process exited with code ${code}`);
  });
}

/**
 * Daily backup trigger without external cron. Enabled via BACKUP_ENABLED=true;
 * the time comes from BACKUP_HOUR / BACKUP_MINUTE (default 02:00 server time).
 * A system cron calling "npm run backup" works just as well — use either.
 */
export function startBackupScheduler() {
  if (scheduled) return;
  const hour = Math.min(23, Math.max(0, parseInt(process.env.BACKUP_HOUR, 10) || 2));
  const minute = Math.min(59, Math.max(0, parseInt(process.env.BACKUP_MINUTE, 10) || 0));

  const scheduleNext = () => {
    const delay = msUntilNextRun(hour, minute);
    log(`next backup in ${(delay / 60000).toFixed(0)} min (daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")})`);
    scheduled = setTimeout(() => {
      runBackupProcess();
      scheduleNext();
    }, delay);
    // Never keep the process alive just for the timer
    if (typeof scheduled.unref === "function") scheduled.unref();
  };

  scheduleNext();
}
