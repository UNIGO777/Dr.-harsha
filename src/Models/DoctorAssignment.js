import mongoose from "mongoose";

const ASSIGNMENT_STATUS_ENUM = ["pending", "in_progress", "completed", "cancelled"];
const ASSIGNMENT_PRIORITY_ENUM = ["low", "medium", "high", "critical"];

const DoctorAssignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    priority: { type: String, enum: ASSIGNMENT_PRIORITY_ENUM, default: "medium" },
    status: { type: String, enum: ASSIGNMENT_STATUS_ENUM, default: "pending" },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

DoctorAssignmentSchema.index({ createdBy: 1, createdAt: -1 });
DoctorAssignmentSchema.index({ assignedTo: 1, status: 1 });
DoctorAssignmentSchema.index({ createdBy: 1, status: 1 });

export const DoctorAssignment = mongoose.model("DoctorAssignment", DoctorAssignmentSchema);
export { ASSIGNMENT_STATUS_ENUM, ASSIGNMENT_PRIORITY_ENUM };
