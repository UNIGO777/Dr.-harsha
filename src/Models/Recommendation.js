import mongoose from "mongoose";
import { SERVICE_CATEGORY_ENUM } from "./ServiceCatalog.js";

/**
 * Service funnel: recommended → interested → booked → paid → completed
 * (or declined at any point). One document per patient-service recommendation;
 * per-stage timestamps make "where is money leaking" a simple aggregation.
 */
export const RECOMMENDATION_STAGE_ENUM = [
  "recommended",
  "interested",
  "booked",
  "paid",
  "completed",
  "declined"
];

const recommendationStageHistorySchema = new mongoose.Schema(
  {
    stage: { type: String, enum: RECOMMENDATION_STAGE_ENUM, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceCatalog", required: true, index: true },
    // Denormalised from the service so funnel aggregations skip a lookup
    category: { type: String, enum: SERVICE_CATEGORY_ENUM, required: true, index: true },
    // Price snapshot at recommendation time — leak value stays honest even if
    // the catalogue price changes later
    expectedValue: { type: Number, min: 0, default: 0 },

    recommendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },

    stage: { type: String, enum: RECOMMENDATION_STAGE_ENUM, default: "recommended", index: true },
    stageHistory: { type: [recommendationStageHistorySchema], default: [] },

    recommendedAt: { type: Date, default: Date.now },
    interestedAt: { type: Date, default: null },
    bookedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    declineReason: { type: String, trim: true, maxlength: 300, default: "" },

    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
    enrollment: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null },
    note: { type: String, trim: true, maxlength: 500, default: "" }
  },
  { timestamps: true }
);

recommendationSchema.index({ category: 1, stage: 1, recommendedAt: -1 });
recommendationSchema.index({ patient: 1, category: 1 });
recommendationSchema.index({ patient: 1, createdAt: -1 });

export const Recommendation =
  mongoose.models.Recommendation || mongoose.model("Recommendation", recommendationSchema);
