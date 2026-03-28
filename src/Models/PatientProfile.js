import mongoose from "mongoose";

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
    lastInteractionAt: { type: Date, default: null },
    nextAppointmentAt: { type: Date, default: null },
    followUpDueAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const PatientProfile =
  mongoose.models.PatientProfile || mongoose.model("PatientProfile", patientProfileSchema);
