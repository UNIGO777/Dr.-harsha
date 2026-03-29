import mongoose from "mongoose";

export const CRM_TASK_CATEGORY_ENUM = [
  "call",
  "lab_reminder",
  "medication_check",
  "appointment_confirmation",
  "urgent_callback",
  "doctor_review"
];

export const CRM_TASK_STATUS_ENUM = ["pending", "in_progress", "completed", "cancelled"];
export const CRM_TASK_PRIORITY_ENUM = ["low", "medium", "high", "critical"];
export const CRM_TASK_OUTCOME_ENUM = [
  "pending",
  "connected",
  "no_answer",
  "voicemail",
  "callback_requested",
  "rescheduled",
  "escalated",
  "completed"
];

const crmTaskNoteSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const crmTaskSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedNurse: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    category: { type: String, enum: CRM_TASK_CATEGORY_ENUM, default: "call" },
    status: { type: String, enum: CRM_TASK_STATUS_ENUM, default: "pending" },
    priority: { type: String, enum: CRM_TASK_PRIORITY_ENUM, default: "medium" },
    dueAt: { type: Date, default: null },
    followUpAt: { type: Date, default: null },
    escalationRequired: { type: Boolean, default: false },
    callOutcome: { type: String, enum: CRM_TASK_OUTCOME_ENUM, default: "pending" },
    lastCalledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    responseSummary: { type: String, trim: true, default: "" },
    patientResponse: { type: String, trim: true, default: "" },
    nextStep: { type: String, trim: true, default: "" },
    respondedAt: { type: Date, default: null },
    linkedNextTask: { type: mongoose.Schema.Types.ObjectId, ref: "CrmTask", default: null },
    linkedAppointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    notes: { type: [crmTaskNoteSchema], default: [] }
  },
  { timestamps: true }
);

export const CrmTask = mongoose.models.CrmTask || mongoose.model("CrmTask", crmTaskSchema);
