import mongoose from "mongoose";

const PATIENT_SERVICE_OPTIONS = ["Health check", "Diabetic", "Senior citizen", "Men", "Women", "Advanced programs", "Diet course"];
const PATIENT_TAG_OPTIONS = ["Stroke", "Diabetes", "Heart health", "BP", "Cholesterol", "Kidney", "Knee pain", "Other"];

const patientProfileNoteSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: null }
  },
  { _id: true }
);

const patientProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    assignedDoctors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    assignedNurses: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium"
    },
    age: { type: Number, default: null, min: 0, max: 130 },
    reference: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    secondaryPhone: { type: String, trim: true, default: "" },
    services: {
      type: [String],
      enum: PATIENT_SERVICE_OPTIONS,
      default: []
    },
    tags: {
      type: [String],
      enum: PATIENT_TAG_OPTIONS,
      default: []
    },
    lastInteractionAt: { type: Date, default: null },
    nextAppointmentAt: { type: Date, default: null },
    followUpDueAt: { type: Date, default: null },
    notes: { type: [patientProfileNoteSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const PatientProfile =
  mongoose.models.PatientProfile || mongoose.model("PatientProfile", patientProfileSchema);
export { PATIENT_SERVICE_OPTIONS, PATIENT_TAG_OPTIONS };
