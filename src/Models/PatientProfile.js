import mongoose from "mongoose";

const PATIENT_SERVICE_OPTIONS = ["Health check", "Diabetic", "Senior citizen", "Men", "Women", "Advanced programs", "Diet course"];
const PATIENT_TAG_OPTIONS = ["Stroke", "Diabetes", "Heart health", "BP", "Cholesterol", "Kidney", "Knee pain", "Other"];
const PATIENT_MEDICATION_TIME_SLOTS = ["morning", "afternoon", "evening", "night"];
const PATIENT_MEDICATION_DURATION_UNITS = ["days", "weeks", "months"];
const PATIENT_MEDICATION_FOOD_TIMING_OPTIONS = ["before_food", "after_food"];

const patientProfileNoteSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: null }
  },
  { _id: true }
);

const patientMedicationSchema = new mongoose.Schema(
  {
    medicineName: { type: String, trim: true, required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    durationValue: { type: Number, required: true, min: 1, max: 3650 },
    durationUnit: {
      type: String,
      enum: PATIENT_MEDICATION_DURATION_UNITS,
      required: true
    },
    timeSlots: {
      type: [String],
      enum: PATIENT_MEDICATION_TIME_SLOTS,
      default: []
    },
    foodTiming: {
      type: String,
      enum: PATIENT_MEDICATION_FOOD_TIMING_OPTIONS,
      required: true
    },
    additionalInfo: { type: String, trim: true, default: "" }
  },
  { _id: true, timestamps: true }
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
    medications: { type: [patientMedicationSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const PatientProfile =
  mongoose.models.PatientProfile || mongoose.model("PatientProfile", patientProfileSchema);
export {
  PATIENT_MEDICATION_DURATION_UNITS,
  PATIENT_MEDICATION_FOOD_TIMING_OPTIONS,
  PATIENT_MEDICATION_TIME_SLOTS,
  PATIENT_SERVICE_OPTIONS,
  PATIENT_TAG_OPTIONS
};
