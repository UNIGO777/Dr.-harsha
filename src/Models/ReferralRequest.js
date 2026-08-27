import mongoose from "mongoose";

/**
 * Referral pipeline: we ASKED a patient to refer someone → they REFERRED a
 * name → that person CONVERTED into a patient (or the ask was declined).
 */
export const REFERRAL_STATUS_ENUM = ["asked", "referred", "converted", "declined"];

const referralRequestSchema = new mongoose.Schema(
  {
    // The existing patient we asked for a referral
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    askedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    askedAt: { type: Date, default: Date.now },

    status: { type: String, enum: REFERRAL_STATUS_ENUM, default: "asked", index: true },

    referredName: { type: String, trim: true, maxlength: 200, default: "" },
    referredPhone: { type: String, trim: true, maxlength: 30, default: "" },
    referredAt: { type: Date, default: null },

    convertedPatient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    convertedLead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },
    convertedAt: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 500, default: "" }
  },
  { timestamps: true }
);

referralRequestSchema.index({ status: 1, createdAt: -1 });
referralRequestSchema.index({ patient: 1, createdAt: -1 });

export const ReferralRequest =
  mongoose.models.ReferralRequest || mongoose.model("ReferralRequest", referralRequestSchema);
