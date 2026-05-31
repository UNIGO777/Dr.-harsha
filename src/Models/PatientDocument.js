import mongoose from "mongoose";

export const PATIENT_DOCUMENT_CATEGORIES = ["lab_report", "prescription", "insurance", "imaging", "other"];

const patientDocumentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: String,
      enum: PATIENT_DOCUMENT_CATEGORIES,
      required: true
    },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    relativePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending_review", "reviewed"],
      default: "pending_review"
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

patientDocumentSchema.index({ patient: 1, createdAt: -1 });
patientDocumentSchema.index({ patient: 1, category: 1 });

export const PatientDocument =
  mongoose.models.PatientDocument || mongoose.model("PatientDocument", patientDocumentSchema);
