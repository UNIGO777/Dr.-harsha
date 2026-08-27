import {
  PATIENT_DISCOVERY_SOURCE_OPTIONS,
  PATIENT_PRIMARY_GOAL_OPTIONS,
  PATIENT_PROFESSION_OPTIONS,
  PATIENT_TRAVEL_TIME_OPTIONS,
  PATIENT_VISIT_REASON_OPTIONS
} from "../Models/patientIntakeOptions.js";

/**
 * Shared parsing / shaping for the "New Patient Information Form" intake block.
 * Used by the create, update and read paths so every panel sees the same shape.
 */

const MAX_TEXT_LENGTH = 200;

const SINGLE_SELECT_FIELDS = {
  profession: PATIENT_PROFESSION_OPTIONS,
  travelTime: PATIENT_TRAVEL_TIME_OPTIONS
};

const MULTI_SELECT_FIELDS = {
  visitReasons: PATIENT_VISIT_REASON_OPTIONS,
  primaryGoals: PATIENT_PRIMARY_GOAL_OPTIONS,
  discoverySources: PATIENT_DISCOVERY_SOURCE_OPTIONS
};

const TEXT_FIELDS = [
  "city",
  "state",
  "professionDetail",
  "visitReasonOther",
  "referredByName",
  "travelTimeDetail",
  "discoverySourceOther"
];

const ATTRIBUTION_FIELDS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "gclid",
  "fbclid",
  "landingPage"
];

function createIntakeError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeText(value, { field, maxLength = MAX_TEXT_LENGTH } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > maxLength) {
    throw createIntakeError(`${field || "Value"} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function normalizeSingleSelect(value, allowedValues, field) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return "";
  if (!allowedValues.includes(normalized)) {
    throw createIntakeError(`Invalid ${field}: "${value}"`);
  }
  return normalized;
}

function normalizeMultiSelect(values, allowedValues, field) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) throw createIntakeError(`${field} must be a list`);

  const selected = [];
  for (const raw of values) {
    const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!normalized) continue;
    if (!allowedValues.includes(normalized)) {
      throw createIntakeError(`Invalid ${field}: "${raw}"`);
    }
    if (!selected.includes(normalized)) selected.push(normalized);
  }
  return selected;
}

function normalizeDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createIntakeError(`${field} is not a valid date`);
  return date;
}

function normalizeAttribution(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const attribution = {};

  for (const field of ATTRIBUTION_FIELDS) {
    attribution[field] = normalizeText(source[field], { field, maxLength: 500 });
  }
  attribution.firstTouchAt = normalizeDate(source.firstTouchAt, "firstTouchAt");

  return attribution;
}

function normalizeConsent(raw, { capturedBy = null, existingConsent = null } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const serviceCommunication = Boolean(source.serviceCommunication);
  const marketingCommunication = Boolean(source.marketingCommunication);
  const hasAnyConsent = serviceCommunication || marketingCommunication;

  // Keep the original consent timestamp once given; only stamp a fresh one when
  // consent is granted for the first time.
  const previousConsentedAt = existingConsent?.consentedAt || null;
  const consentedAt = hasAnyConsent ? previousConsentedAt || new Date() : null;

  return {
    serviceCommunication,
    marketingCommunication,
    signatureName: normalizeText(source.signatureName, { field: "signatureName" }),
    consentedAt,
    capturedBy: hasAnyConsent ? existingConsent?.capturedBy || capturedBy || null : null
  };
}

/**
 * Build the complete intake sub-document. Used when creating a patient, and
 * when an update sends the whole intake block at once.
 */
export function normalizePatientIntake(raw, { capturedBy = null, existingIntake = null } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const intake = {};

  intake.intakeDate = normalizeDate(source.intakeDate, "intakeDate") || new Date();

  for (const field of TEXT_FIELDS) {
    intake[field] = normalizeText(source[field], { field });
  }

  for (const [field, allowedValues] of Object.entries(SINGLE_SELECT_FIELDS)) {
    intake[field] = normalizeSingleSelect(source[field], allowedValues, field);
  }

  for (const [field, allowedValues] of Object.entries(MULTI_SELECT_FIELDS)) {
    intake[field] = normalizeMultiSelect(source[field], allowedValues, field);
  }

  intake.attribution = normalizeAttribution(source.attribution);
  intake.consent = normalizeConsent(source.consent, { capturedBy, existingConsent: existingIntake?.consent });

  // "Other" free-text only makes sense when the matching option is selected.
  if (intake.profession !== "other" && !intake.professionDetail) intake.professionDetail = "";
  if (!intake.visitReasons.includes("other")) intake.visitReasonOther = "";
  if (!intake.discoverySources.includes("other")) intake.discoverySourceOther = "";

  return intake;
}

/**
 * Build a dotted `$set` payload so a partial intake update never wipes the
 * fields the caller did not send.
 */
export function buildPatientIntakeUpdate(raw, { capturedBy = null, existingIntake = null } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const update = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);

  if (has("intakeDate")) update["intake.intakeDate"] = normalizeDate(source.intakeDate, "intakeDate");

  for (const field of TEXT_FIELDS) {
    if (has(field)) update[`intake.${field}`] = normalizeText(source[field], { field });
  }

  for (const [field, allowedValues] of Object.entries(SINGLE_SELECT_FIELDS)) {
    if (has(field)) update[`intake.${field}`] = normalizeSingleSelect(source[field], allowedValues, field);
  }

  for (const [field, allowedValues] of Object.entries(MULTI_SELECT_FIELDS)) {
    if (has(field)) update[`intake.${field}`] = normalizeMultiSelect(source[field], allowedValues, field);
  }

  if (has("attribution")) update["intake.attribution"] = normalizeAttribution(source.attribution);
  if (has("consent")) {
    update["intake.consent"] = normalizeConsent(source.consent, {
      capturedBy,
      existingConsent: existingIntake?.consent
    });
  }

  return update;
}

/** Stable API shape for every read path. Never returns undefined sub-objects. */
export function buildPatientIntakeResponse(profile) {
  const intake = profile?.intake || {};
  const attribution = intake.attribution || {};
  const consent = intake.consent || {};

  const response = {
    intakeDate: intake.intakeDate || null,
    profession: intake.profession || "",
    travelTime: intake.travelTime || "",
    visitReasons: Array.isArray(intake.visitReasons) ? intake.visitReasons : [],
    primaryGoals: Array.isArray(intake.primaryGoals) ? intake.primaryGoals : [],
    discoverySources: Array.isArray(intake.discoverySources) ? intake.discoverySources : [],
    attribution: {
      firstTouchAt: attribution.firstTouchAt || null
    },
    consent: {
      serviceCommunication: Boolean(consent.serviceCommunication),
      marketingCommunication: Boolean(consent.marketingCommunication),
      signatureName: consent.signatureName || "",
      consentedAt: consent.consentedAt || null
    }
  };

  for (const field of TEXT_FIELDS) {
    response[field] = intake[field] || "";
  }
  for (const field of ATTRIBUTION_FIELDS) {
    response.attribution[field] = attribution[field] || "";
  }

  return response;
}

export const PATIENT_INTAKE_TEXT_FIELDS = TEXT_FIELDS;
