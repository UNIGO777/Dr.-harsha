import mongoose from "mongoose";

/**
 * Billable service catalogue. Every invoice line and recommendation points at
 * one of these, so revenue can always be broken down by category.
 */
export const SERVICE_CATEGORY_ENUM = [
  "consultation",
  "lyfinfinity",
  "diagnostics",
  "diet",
  "programme",
  "medicines",
  "blood_test",
  "other"
];

export const SERVICE_CATEGORY_LABELS = {
  consultation: "Consultation",
  lyfinfinity: "LyfInfinity",
  diagnostics: "Diagnostics",
  diet: "Diet",
  programme: "Programmes",
  medicines: "Medicines",
  blood_test: "Blood tests",
  other: "Other"
};

const serviceCatalogSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    category: { type: String, enum: SERVICE_CATEGORY_ENUM, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    // For programmes/memberships: how long one purchase lasts. A paid invoice
    // for a service with durationDays auto-creates an Enrollment (renewal tracking).
    durationDays: { type: Number, min: 1, max: 3650, default: null },
    renewable: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

serviceCatalogSchema.index({ active: 1, category: 1, name: 1 });

export const ServiceCatalog =
  mongoose.models.ServiceCatalog || mongoose.model("ServiceCatalog", serviceCatalogSchema);
