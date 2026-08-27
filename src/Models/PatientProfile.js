import mongoose from "mongoose";
import {
  PATIENT_DISCOVERY_SOURCE_OPTIONS,
  PATIENT_PRIMARY_GOAL_OPTIONS,
  PATIENT_PROFESSION_OPTIONS,
  PATIENT_TRAVEL_TIME_OPTIONS,
  PATIENT_VISIT_REASON_OPTIONS
} from "./patientIntakeOptions.js";

const PATIENT_SERVICE_OPTIONS = ["Health check", "Diabetic", "Senior citizen", "Men", "Women", "Advanced programs", "Diet course"];
const PATIENT_TAG_OPTIONS = ["Stroke", "Diabetes", "Heart health", "BP", "Cholesterol", "Kidney", "Knee pain", "Other"];
const PATIENT_MEDICATION_TIME_SLOTS = ["morning", "afternoon", "evening", "night"];
const PATIENT_MEDICATION_DURATION_UNITS = ["hours", "days", "weeks", "months"];
const PATIENT_MEDICATION_FOOD_TIMING_OPTIONS = ["before_food", "after_food"];

const patientProfileNoteSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: null }
  },
  { _id: true }
);

const patientMedicationSchema = new mongoose.Schema(
  {
    medicineName: { type: String, trim: true, required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    durationValue: { type: Number, required: true, min: 1, max: 3650 },
    durationUnit: {
      type: String,
      enum: PATIENT_MEDICATION_DURATION_UNITS,
      required: true
    },
    timeSlots: {
      type: [String],
      enum: PATIENT_MEDICATION_TIME_SLOTS,
      default: []
    },
    foodTiming: {
      type: String,
      enum: PATIENT_MEDICATION_FOOD_TIMING_OPTIONS,
      required: true
    },
    additionalInfo: { type: String, trim: true, default: "" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null }
  },
  { _id: true, timestamps: true }
);

/**
 * Digital attribution captured when the lead arrives through a campaign or the
 * public website. Filled by the booking/landing page, not by staff.
 */
const patientAttributionSchema = new mongoose.Schema(
  {
    utmSource: { type: String, trim: true, default: "" },
    utmMedium: { type: String, trim: true, default: "" },
    utmCampaign: { type: String, trim: true, default: "" },
    utmContent: { type: String, trim: true, default: "" },
    utmTerm: { type: String, trim: true, default: "" },
    gclid: { type: String, trim: true, default: "" },
    fbclid: { type: String, trim: true, default: "" },
    landingPage: { type: String, trim: true, default: "" },
    firstTouchAt: { type: Date, default: null }
  },
  { _id: false }
);

const patientConsentSchema = new mongoose.Schema(
  {
    serviceCommunication: { type: Boolean, default: false },
    marketingCommunication: { type: Boolean, default: false },
    signatureName: { type: String, trim: true, default: "" },
    consentedAt: { type: Date, default: null },
    capturedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { _id: false }
);

/** Mirrors the printed "New Patient Information Form" used at the front desk. */
const patientIntakeSchema = new mongoose.Schema(
  {
    intakeDate: { type: Date, default: null },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },

    profession: { type: String, enum: ["", ...PATIENT_PROFESSION_OPTIONS], default: "" },
    professionDetail: { type: String, trim: true, maxlength: 200, default: "" },

    visitReasons: { type: [String], enum: PATIENT_VISIT_REASON_OPTIONS, default: [] },
    visitReasonOther: { type: String, trim: true, maxlength: 200, default: "" },

    primaryGoals: { type: [String], enum: PATIENT_PRIMARY_GOAL_OPTIONS, default: [] },
    referredByName: { type: String, trim: true, maxlength: 200, default: "" },

    travelTime: { type: String, enum: ["", ...PATIENT_TRAVEL_TIME_OPTIONS], default: "" },
    travelTimeDetail: { type: String, trim: true, maxlength: 200, default: "" },

    discoverySources: { type: [String], enum: PATIENT_DISCOVERY_SOURCE_OPTIONS, default: [] },
    discoverySourceOther: { type: String, trim: true, maxlength: 200, default: "" },

    attribution: { type: patientAttributionSchema, default: () => ({}) },
    consent: { type: patientConsentSchema, default: () => ({}) }
  },
  { _id: false }
);

const patientProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    assignedDoctors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    assignedNurses: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium"
    },
    age: { type: Number, default: null, min: 0, max: 130 },
    // Legacy free-text referral note. Superseded by `intake.discoverySources`;
    // kept so existing records and older panels keep working.
    reference: { type: String, trim: true, default: "" },
    intake: { type: patientIntakeSchema, default: () => ({}) },
    address: { type: String, trim: true, default: "" },
    secondaryPhone: { type: String, trim: true, default: "" },
    services: {
      type: [String],
      enum: PATIENT_SERVICE_OPTIONS,
      default: []
    },
    tags: {
      type: [String],
      enum: PATIENT_TAG_OPTIONS,
      default: []
    },
    emergencyContact: {
      name: { type: String, trim: true, default: "" },
      relation: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" }
    },
    bloodGroup: {
      type: String,
      enum: ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      default: ""
    },
    allergies: { type: [String], default: [] },
    existingConditions: { type: [String], default: [] },
    notificationPreferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      appointmentReminders: { type: Boolean, default: true },
      reportAlerts: { type: Boolean, default: true },
      medicationReminders: { type: Boolean, default: true }
    },
    lastInteractionAt: { type: Date, default: null },
    nextAppointmentAt: { type: Date, default: null },
    followUpDueAt: { type: Date, default: null },
    notes: { type: [patientProfileNoteSchema], default: [] },
    medications: { type: [patientMedicationSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

patientProfileSchema.index({ assignedDoctors: 1, assignedNurses: 1 });
// Indexes for nurse panel queries (single-field lookups done without the composite index)
patientProfileSchema.index({ assignedNurses: 1 });
patientProfileSchema.index({ assignedDoctors: 1 });
patientProfileSchema.index({ assignedNurses: 1, lastInteractionAt: -1 });
// Indexes for date-based dashboard queries
patientProfileSchema.index({ followUpDueAt: 1 });
patientProfileSchema.index({ nextAppointmentAt: 1 });
// Lead-register analytics: source / profession / geography / travel-time breakdowns
patientProfileSchema.index({ "intake.discoverySources": 1, createdAt: -1 });
patientProfileSchema.index({ "intake.profession": 1 });
patientProfileSchema.index({ "intake.travelTime": 1 });
patientProfileSchema.index({ "intake.city": 1, "intake.state": 1 });
patientProfileSchema.index({ "intake.attribution.utmCampaign": 1 });

export const PatientProfile =
  mongoose.models.PatientProfile || mongoose.model("PatientProfile", patientProfileSchema);
export {
  PATIENT_MEDICATION_DURATION_UNITS,
  PATIENT_MEDICATION_FOOD_TIMING_OPTIONS,
  PATIENT_MEDICATION_TIME_SLOTS,
  PATIENT_SERVICE_OPTIONS,
  PATIENT_TAG_OPTIONS
};
export {
  PATIENT_DISCOVERY_SOURCE_OPTIONS,
  PATIENT_PRIMARY_GOAL_OPTIONS,
  PATIENT_PROFESSION_OPTIONS,
  PATIENT_TRAVEL_TIME_OPTIONS,
  PATIENT_VISIT_REASON_OPTIONS
};
