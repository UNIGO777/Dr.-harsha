import mongoose from "mongoose";

export const APPOINTMENT_STATUS_ENUM = ["scheduled", "pending", "confirmed", "checked_in", "completed", "cancelled", "no_show"];
export const APPOINTMENT_TYPE_ENUM = ["in_person", "follow_up", "walk_in", "online_consultation"];
export const APPOINTMENT_NOTE_TYPE_ENUM = ["note", "status", "reminder", "confirmation", "instruction", "reschedule", "system"];

const appointmentNoteSchema = new mongoose.Schema(
  {
    type: { type: String, enum: APPOINTMENT_NOTE_TYPE_ENUM, default: "note" },
    channel: { type: String, enum: ["system", "email", "phone", "desk"], default: "system" },
    message: { type: String, trim: true, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },
    slotMinutes: { type: Number, required: true, min: 5 },
    reason: { type: String, trim: true, required: true },
    appointmentType: { type: String, enum: APPOINTMENT_TYPE_ENUM, default: "in_person" },
    status: { type: String, enum: APPOINTMENT_STATUS_ENUM, default: "scheduled" },
    outcome: { type: String, trim: true, default: "" },
    preparationInstructions: { type: String, trim: true, default: "" },
    documentsRequired: { type: Boolean, default: false },
    reportsRequired: { type: Boolean, default: false },
    preVisitUpdateRequired: { type: Boolean, default: false },
    confirmationSentAt: { type: Date, default: null },
    lastReminderAt: { type: Date, default: null },
    lastReminderType: { type: String, enum: ["reminder", "confirmation", "instructions", ""], default: "" },
    checkedInAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    noShowAt: { type: Date, default: null },
    notes: { type: [appointmentNoteSchema], default: [] }
  },
  { timestamps: true }
);

export const Appointment = mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);
