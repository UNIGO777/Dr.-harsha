import mongoose from "mongoose";

/**
 * One row per automated backup attempt. The backup script writes these; the
 * admin dashboard reads the latest to raise "backup failed / missing" alerts.
 */
export const BACKUP_RUN_STATUS_ENUM = ["success", "failed"];

const backupRunSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    status: { type: String, enum: BACKUP_RUN_STATUS_ENUM, required: true, index: true },
    sizeBytes: { type: Number, min: 0, default: 0 },
    // Where the encrypted archive landed (bucket/path)
    location: { type: String, trim: true, maxlength: 500, default: "" },
    checksum: { type: String, trim: true, maxlength: 200, default: "" },
    error: { type: String, trim: true, maxlength: 1000, default: "" }
  },
  { timestamps: true }
);

backupRunSchema.index({ startedAt: -1 });

export const BackupRun = mongoose.models.BackupRun || mongoose.model("BackupRun", backupRunSchema);
