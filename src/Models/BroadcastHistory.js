import mongoose from "mongoose";

const broadcastAttachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, trim: true, required: true },
    contentType: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const broadcastRecipientSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userNumber: { type: Number, default: null },
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true },
    role: { type: String, trim: true, required: true },
    status: { type: String, enum: ["sent", "failed"], required: true },
    reason: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const broadcastSenderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userNumber: { type: Number, default: null },
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true },
    role: { type: String, trim: true, required: true }
  },
  { _id: false }
);

const broadcastAudienceSummarySchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0 },
    doctors: { type: Number, default: 0 },
    nurses: { type: Number, default: 0 },
    patients: { type: Number, default: 0 }
  },
  { _id: false }
);

const broadcastHistorySchema = new mongoose.Schema(
  {
    sender: { type: broadcastSenderSchema, required: true },
    subject: { type: String, trim: true, required: true },
    summary: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, required: true },
    attachments: { type: [broadcastAttachmentSchema], default: [] },
    requestedCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    audience: { type: broadcastAudienceSummarySchema, default: () => ({}) },
    recipients: { type: [broadcastRecipientSchema], default: [] }
  },
  { timestamps: true }
);

broadcastHistorySchema.index({ "sender.user": 1, createdAt: -1 });
broadcastHistorySchema.index({ createdAt: -1 });

export const BroadcastHistory =
  mongoose.models.BroadcastHistory || mongoose.model("BroadcastHistory", broadcastHistorySchema);
