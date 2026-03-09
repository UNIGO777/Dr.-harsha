export const DIABETES_RISK_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract diabetes-related labs from the provided document/image/text.",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "If a field is not present, use null.",
  "Be conservative: only extract values that are clearly stated with units or labels."
].join("\n");

export const DIABETES_RISK_SCHEMA_HINT = `{
  "diabetesRisk": {
    "labs": {
      "hba1cPct": null,
      "fastingGlucoseMg_dL": null,
      "fastingInsulinUu_mL": null,
      "ldlMg_dL": null
    }
  }
}`;

export function buildDiabetesRiskUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  return [
    "Extract HbA1c, fasting glucose (FBS), fasting insulin, and LDL cholesterol from the attached report(s)/image(s).",
    "Return JSON matching this schema:",
    DIABETES_RISK_SCHEMA_HINT,
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
