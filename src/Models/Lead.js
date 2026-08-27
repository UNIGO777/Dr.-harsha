import mongoose from "mongoose";
import { PATIENT_DISCOVERY_SOURCE_OPTIONS } from "./patientIntakeOptions.js";

/**
 * Lead register: an enquiry that has not (yet) become a patient account.
 * Pipeline: new → contacted → interested → booked → converted (or lost).
 * "converted" links the lead to the User created for them, so lead-source
 * analytics and patient records stay joined.
 */
export const LEAD_STAGE_ENUM = ["new", "contacted", "interested", "booked", "converted", "lost"];

const leadNoteSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const leadStageHistorySchema = new mongoose.Schema(
  {
    stage: { type: String, enum: LEAD_STAGE_ENUM, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    city: { type: String, trim: true, default: "" },

    source: { type: String, enum: ["", ...PATIENT_DISCOVERY_SOURCE_OPTIONS], default: "" },
    sourceDetail: { type: String, trim: true, maxlength: 300, default: "" },
    // What they asked about, e.g. "Full body check", "LyfInfinity"
    interestedIn: { type: String, trim: true, maxlength: 300, default: "" },

    stage: { type: String, enum: LEAD_STAGE_ENUM, default: "new", index: true },
    stageHistory: { type: [leadStageHistorySchema], default: [] },

    firstContactedAt: { type: Date, default: null },
    lastContactedAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    convertedPatient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    convertedAt: { type: Date, default: null },
    lostReason: { type: String, trim: true, maxlength: 300, default: "" },

    notes: { type: [leadNoteSchema], default: [] }
  },
  { timestamps: true }
);

// "N leads have not been called" alert + pipeline listing
leadSchema.index({ stage: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, stage: 1, nextFollowUpAt: 1 });
leadSchema.index({ source: 1, createdAt: -1 });

export const Lead = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
