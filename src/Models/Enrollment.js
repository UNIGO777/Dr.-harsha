import mongoose from "mongoose";
import { SERVICE_CATEGORY_ENUM } from "./ServiceCatalog.js";

/**
 * A patient's active programme / membership window (LyfInfinity, diet course,
 * any catalogue service with durationDays). Drives "renewals due" and
 * "programme patients missed follow-up".
 */
export const ENROLLMENT_STATUS_ENUM = ["active", "completed", "renewed", "lapsed", "cancelled"];

const enrollmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceCatalog", required: true },
    category: { type: String, enum: SERVICE_CATEGORY_ENUM, required: true, index: true },

    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    renewalDueAt: { type: Date, default: null, index: true },

    status: { type: String, enum: ENROLLMENT_STATUS_ENUM, default: "active", index: true },

    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
    recommendation: { type: mongoose.Schema.Types.ObjectId, ref: "Recommendation", default: null },
    // Set when this enrollment is renewed into a fresh one
    renewedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null },

    notes: { type: String, trim: true, maxlength: 500, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

enrollmentSchema.index({ status: 1, renewalDueAt: 1 });
enrollmentSchema.index({ patient: 1, status: 1 });
enrollmentSchema.index({ category: 1, createdAt: -1 });

export const Enrollment = mongoose.models.Enrollment || mongoose.model("Enrollment", enrollmentSchema);
