import mongoose from "mongoose";

export const VITAL_TYPES = ["blood_pressure", "blood_sugar", "weight", "heart_rate", "spo2", "temperature"];

export const VITAL_UNITS = {
  blood_pressure: "mmHg",
  blood_sugar: "mg/dL",
  weight: "kg",
  heart_rate: "bpm",
  spo2: "%",
  temperature: "°F"
};

const patientVitalSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: VITAL_TYPES, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    unit: { type: String, required: true },
    recordedAt: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 300, default: "" }
  },
  { timestamps: true }
);

patientVitalSchema.index({ patient: 1, type: 1, recordedAt: -1 });
patientVitalSchema.index({ patient: 1, recordedAt: -1 });

export const PatientVital = mongoose.models.PatientVital || mongoose.model("PatientVital", patientVitalSchema);
