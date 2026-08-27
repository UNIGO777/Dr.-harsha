import mongoose from "mongoose";
import { SERVICE_CATEGORY_ENUM } from "./ServiceCatalog.js";

export const PAYMENT_METHOD_ENUM = ["cash", "upi", "card", "bank_transfer", "cheque", "other"];

/**
 * Money actually received against an invoice. `allocations` splits the amount
 * across the invoice's item categories (proportionally) at record time, so
 * "revenue by category" is one aggregation with no joins.
 */
const paymentAllocationSchema = new mongoose.Schema(
  {
    category: { type: String, enum: SERVICE_CATEGORY_ENUM, required: true },
    amount: { type: Number, min: 0, required: true }
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: PAYMENT_METHOD_ENUM, required: true },
    // UTR / transaction id / cheque number
    reference: { type: String, trim: true, maxlength: 200, default: "" },
    paidAt: { type: Date, default: Date.now, index: true },
    allocations: { type: [paymentAllocationSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

paymentSchema.index({ paidAt: -1 });
paymentSchema.index({ "allocations.category": 1, paidAt: -1 });

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
