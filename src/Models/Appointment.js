import mongoose from "mongoose";

export const APPOINTMENT_STATUS_ENUM = ["scheduled", "completed", "cancelled"];

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },
    slotMinutes: { type: Number, required: true, min: 5 },
    reason: { type: String, trim: true, required: true },
    status: { type: String, enum: APPOINTMENT_STATUS_ENUM, default: "scheduled" },
    outcome: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

export const Appointment = mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);
