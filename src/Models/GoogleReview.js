import mongoose from "mongoose";

/**
 * Manually logged Google reviews (front desk records each one as it appears).
 * Swap the write path for a Google Business Profile API sync later without
 * touching the dashboard, which only counts these rows.
 */
const googleReviewSchema = new mongoose.Schema(
  {
    reviewedAt: { type: Date, default: Date.now, index: true },
    rating: { type: Number, min: 1, max: 5, default: null },
    reviewerName: { type: String, trim: true, maxlength: 200, default: "" },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    referral: { type: mongoose.Schema.Types.ObjectId, ref: "ReferralRequest", default: null },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const GoogleReview = mongoose.models.GoogleReview || mongoose.model("GoogleReview", googleReviewSchema);
