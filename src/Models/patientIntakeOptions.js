/**
 * Option sets for the "New Patient Information Form" intake / lead register.
 * Values are stored as stable slugs; labels are only for exports and analytics
 * (the panels keep their own copy in Panels/shared/userCreation/intakeOptions.js).
 */

export const PATIENT_PROFESSION_OPTIONS = [
  "business_owner",
  "corporate_it",
  "doctor_healthcare",
  "government_service",
  "student",
  "homemaker",
  "retired",
  "other"
];

export const PATIENT_VISIT_REASON_OPTIONS = [
  "preventive_health_check",
  "lifestyle_disease",
  "fatigue_stress",
  "gut_metabolic_health",
  "longevity_wellness",
  "other"
];

export const PATIENT_PRIMARY_GOAL_OPTIONS = [
  "prevent_disease",
  "reverse_existing_condition",
  "improve_energy_performance",
  "weight_management",
  "healthy_ageing_longevity",
  "general_wellness"
];

export const PATIENT_TRAVEL_TIME_OPTIONS = ["under_15_min", "15_to_30_min", "30_to_60_min", "over_1_hour"];

export const PATIENT_DISCOVERY_SOURCE_OPTIONS = [
  "google_search",
  "google_maps",
  "google_ads",
  "instagram",
  "facebook",
  "meta_ads",
  "youtube",
  "friend_family",
  "doctor_referral",
  "patient_referral",
  "walk_in",
  "website",
  "whatsapp",
  "health_camp",
  "corporate_tieup",
  "other"
];

export const PATIENT_INTAKE_LABELS = {
  profession: {
    business_owner: "Business Owner",
    corporate_it: "Corporate / IT Professional",
    doctor_healthcare: "Doctor / Healthcare",
    government_service: "Government Service",
    student: "Student",
    homemaker: "Homemaker",
    retired: "Retired",
    other: "Other"
  },
  visitReason: {
    preventive_health_check: "Preventive Health Check",
    lifestyle_disease: "Lifestyle Disease (Diabetes / BP / Weight)",
    fatigue_stress: "Fatigue / Stress",
    gut_metabolic_health: "Gut / Metabolic Health",
    longevity_wellness: "Longevity / Wellness",
    other: "Other"
  },
  primaryGoal: {
    prevent_disease: "Prevent disease",
    reverse_existing_condition: "Reverse existing condition",
    improve_energy_performance: "Improve energy & performance",
    weight_management: "Weight management",
    healthy_ageing_longevity: "Healthy ageing / Longevity",
    general_wellness: "General wellness"
  },
  travelTime: {
    under_15_min: "Less than 15 minutes",
    "15_to_30_min": "15–30 minutes",
    "30_to_60_min": "30–60 minutes",
    over_1_hour: "More than 1 hour"
  },
  discoverySource: {
    google_search: "Google Search",
    google_maps: "Google Maps",
    google_ads: "Google Ads",
    instagram: "Instagram",
    facebook: "Facebook",
    meta_ads: "Meta Ads",
    youtube: "YouTube",
    friend_family: "Friend / Family",
    doctor_referral: "Doctor referral",
    patient_referral: "Patient referral",
    walk_in: "Walk-in / Passing by",
    website: "Website",
    whatsapp: "WhatsApp",
    health_camp: "Health camp",
    corporate_tieup: "Corporate tie-up",
    other: "Other"
  }
};

export function labelForIntakeValue(group, value) {
  return PATIENT_INTAKE_LABELS?.[group]?.[value] || "";
}
