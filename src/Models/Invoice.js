import mongoose from "mongoose";
import { SERVICE_CATEGORY_ENUM } from "./ServiceCatalog.js";

export const INVOICE_STATUS_ENUM = ["unpaid", "partially_paid", "paid", "cancelled"];

const INVOICE_NUMBER_COUNTER_KEY = "invoice_number";

// Same shape as the counter registered by User.js — reuse if already compiled.
const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

const invoiceItemSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceCatalog", default: null },
    label: { type: String, trim: true, required: true },
    category: { type: String, enum: SERVICE_CATEGORY_ENUM, required: true },
    quantity: { type: Number, min: 1, default: 1 },
    unitPrice: { type: Number, min: 0, required: true },
    // Absolute discount on this line (not a percentage)
    discount: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, required: true }
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: {
      type: [invoiceItemSchema],
      validate: [(items) => Array.isArray(items) && items.length > 0, "Invoice needs at least one item"]
    },
    subtotal: { type: Number, min: 0, required: true },
    // Line discounts + the overall discount together
    discountTotal: { type: Number, min: 0, default: 0 },
    overallDiscount: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, required: true },
    amountPaid: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: INVOICE_STATUS_ENUM, default: "unpaid", index: true },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

invoiceSchema.index({ patient: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, createdAt: -1 });

invoiceSchema.pre("validate", async function assignInvoiceNumber(next) {
  try {
    if (!this.isNew || this.invoiceNumber) return next();

    const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
    const counter = await Counter.findOneAndUpdate(
      { key: INVOICE_NUMBER_COUNTER_KEY },
      { $inc: { value: 1 }, $setOnInsert: { key: INVOICE_NUMBER_COUNTER_KEY } },
      { new: true, upsert: true }
    );

    // Simple sequential series; switch to a financial-year format here if the
    // clinic's accountant needs one — old numbers stay valid.
    this.invoiceNumber = `INV-${String(counter.value).padStart(6, "0")}`;
    next();
  } catch (err) {
    next(err);
  }
});

export const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
