import mongoose from "mongoose";

/**
 * Nurse → doctor handover before a consultation. One note per appointment.
 * draft: nurse still writing · submitted: visible to the doctor ·
 * acknowledged: the doctor has read it.
 */
export const PRECONSULTATION_STATUS_ENUM = ["draft", "submitted", "acknowledged"];

const preConsultationVitalsSchema = new mongoose.Schema(
  {
    bloodPressure: { type: String, trim: true, maxlength: 20, default: "" },
    pulse: { type: String, trim: true, maxlength: 20, default: "" },
    temperature: { type: String, trim: true, maxlength: 20, default: "" },
    spo2: { type: String, trim: true, maxlength: 20, default: "" },
    weightKg: { type: String, trim: true, maxlength: 20, default: "" },
    heightCm: { type: String, trim: true, maxlength: 20, default: "" },
    bloodSugar: { type: String, trim: true, maxlength: 30, default: "" }
  },
  { _id: false }
);

const preConsultationNoteSchema = new mongoose.Schema(
  {
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    nurse: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    chiefComplaint: { type: String, trim: true, maxlength: 1000, default: "" },
    vitals: { type: preConsultationVitalsSchema, default: () => ({}) },
    currentMedications: { type: String, trim: true, maxlength: 1000, default: "" },
    observations: { type: String, trim: true, maxlength: 2000, default: "" },
    redFlags: { type: String, trim: true, maxlength: 1000, default: "" },
    documentsSummary: { type: String, trim: true, maxlength: 1000, default: "" },

    status: { type: String, enum: PRECONSULTATION_STATUS_ENUM, default: "draft", index: true },
    submittedAt: { type: Date, default: null },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    acknowledgedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

preConsultationNoteSchema.index({ doctor: 1, status: 1, updatedAt: -1 });

export const PreConsultationNote =
  mongoose.models.PreConsultationNote || mongoose.model("PreConsultationNote", preConsultationNoteSchema);
