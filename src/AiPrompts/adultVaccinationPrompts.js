export const ADULT_VACCINATION_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract the adult vaccination plan/recommendations from the provided document/image/text.",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "If a field is not present, use null or empty string as appropriate.",
  "Be conservative: only extract values that are clearly stated."
].join("\n");

export const ADULT_VACCINATION_SCHEMA_HINT = `{
  "adultVaccination": {
    "riskFactors": [],
    "flu": { "planned": "" },
    "pneumonia": { "planned": "", "vaccine": "prevnar_20" },
    "shingrix": { "planned": "", "dose1": "", "dose2": "" },
    "hepatitisB": { "planned": "", "schedule": "0-1-6 months" },
    "hepatitisA": { "planned": "" },
    "cervicalCancer": { "planned": "" },
    "notes": []
  }
}`;

export function buildAdultVaccinationUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  const allowedRiskFactors = [
    "diabetes",
    "chronic_lung_disease",
    "chronic_heart_disease",
    "chronic_liver_disease",
    "ckd",
    "smokers",
    "alcohol_use_disorder",
    "immunocompromised",
    "hiv",
    "cancer",
    "asplenia",
    "cochlear_implant",
    "csf_leak",
    "healthcare_workers",
    "high_risk_individuals"
  ];

  return [
    "Extract the ADULT VACCINATION section from the attached report(s)/image(s).",
    "Output JSON matching this schema:",
    ADULT_VACCINATION_SCHEMA_HINT,
    "",
    "Rules:",
    "- Use planned: 'yes' | 'no' | '' (empty string if unknown).",
    "- Use pneumonia.vaccine as 'prevnar_20' if stated as Prevenar/Prevnar 20.",
    "- Use hepatitisB.schedule as the exact schedule string if present (e.g., '0-1-6 months').",
    "- riskFactors must be an array of canonical values chosen ONLY from the allowed list below.",
    allowedRiskFactors.join(", "),
    "",
    "Patient context (may help disambiguation; do not hallucinate values):",
    `name: ${name || "unknown"}`,
    `sex: ${sex || "unknown"}`,
    `age: ${age != null ? age : "unknown"}`,
    "",
    "Vaccination guidance for reference (do not invent if not stated in report):",
    "- Flu: every year, age > 18",
    "- Pneumonia: Prevnar 20 single dose; all age > 50 OR risk factors",
    "- Shingrix: Dose 1 and Dose 2 after 2-6 months; all age > 50 OR risk factors",
    "- Hepatitis B: 0-1-6 months; diabetics, healthcare workers, CKD, liver disease, high-risk",
    "- Hepatitis A: chronic liver disease",
    "- Cervical cancer vaccine: as applicable",
    "",
    "Text extracted from documents (may be empty):",
    typeof extractedText === "string" ? extractedText : ""
  ].join("\n");
}
