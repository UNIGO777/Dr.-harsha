export const GENES_HEALTH_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract which genetic panels/tests are selected or present in the provided document/image/text.",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "If a field is not present, use null or empty string as appropriate.",
  "Be conservative: only extract values that are clearly stated."
].join("\n");

export const GENES_HEALTH_SCHEMA_HINT = `{
  "genesHealth": {
    "selected": [],
    "notes": []
  }
}`;

export function buildGenesHealthUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  const allowed = [
    "genetic_risk_cad",
    "integrated_risk_cad",
    "genetic_diabetes_risk_score",
    "genetic_risk_obesity",
    "personalized_drug_response",
    "genetic_risk_hypertension",
    "genetic_risk_nafld",
    "genetic_risk_hypercholesterolemia",
    "biological_age_pace_of_aging",
    "genetic_risk_parkinsons_alzheimers",
    "genetic_risk_hereditary_cancer",
    "genetic_risk_amd",
    "dna_variations_common_diseases_drug_response",
    "genetic_risk_of_specific_categories"
  ];

  return [
    "Extract the GENES HEALTH / GENETIC TESTS selection list from the attached report(s)/image(s).",
    "Output JSON matching this schema:",
    GENES_HEALTH_SCHEMA_HINT,
    "",
    "Rules:",
    "- selected must be an array of canonical keys chosen ONLY from the allowed list below.",
    "- Only include a key if the report clearly indicates it is selected/checked/included/ordered.",
    "- notes can include any short plain-text lines that clarify selections.",
    allowed.join(", "),
    "",
    "Patient context (may help disambiguation; do not hallucinate values):",
    `name: ${name || "unknown"}`,
    `sex: ${sex || "unknown"}`,
    `age: ${age != null ? age : "unknown"}`,
    "",
    "Text extracted from documents (may be empty):",
    typeof extractedText === "string" ? extractedText : ""
  ].join("\n");
}

