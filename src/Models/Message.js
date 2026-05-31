import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["patient", "nurse", "doctor"], required: true },
    content: { type: String, trim: true, maxlength: 2000, default: "" },
    messageType: { type: String, enum: ["text", "file"], default: "text" },
    fileAttachment: {
      originalName: { type: String, default: "" },
      storedName: { type: String, default: "" },
      relativePath: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      size: { type: Number, default: 0 }
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

const conversationSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    careTeamMember: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    careTeamRole: { type: String, enum: ["nurse", "doctor"], required: true },
    subject: { type: String, trim: true, maxlength: 200, default: "General" },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, trim: true, maxlength: 100, default: "" },
    patientUnreadCount: { type: Number, default: 0 },
    careTeamUnreadCount: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "archived"], default: "active" }
  },
  { timestamps: true }
);

conversationSchema.index({ patient: 1, lastMessageAt: -1 });
conversationSchema.index({ careTeamMember: 1, lastMessageAt: -1 });

export const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);
export const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
