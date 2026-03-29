import mongoose from "mongoose";

const patientProfileNoteSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
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
