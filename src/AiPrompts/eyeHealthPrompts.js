export const EYE_HEALTH_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract EYE / RETINA (fundoscopy/retinoscopy) findings from the provided document/image/text.",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "If a field is not present, use null or empty string as appropriate.",
  "Be conservative: only mark retinopathy 'yes' when clearly stated."
].join("\n");

export const EYE_HEALTH_SCHEMA_HINT = `{
  "eyeHealth": {
    "retinoscopy": {
      "retinopathy": "yes|no|",
      "type": "",
      "severity": "",
      "findings": "",
      "impression": ""
    },
    "otherFindings": "",
    "notes": []
  }
}`;

export function buildEyeHealthUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;
  const diabetesYears = Number.isFinite(p.diabetesYears) ? p.diabetesYears : null;
  const diabetes = typeof p.diabetes === "boolean" ? (p.diabetes ? "yes" : "no") : "";
  const hypertension = typeof p.hypertension === "boolean" ? (p.hypertension ? "yes" : "no") : "";

  return [
    "Extract eye health / retina findings from the attached report(s)/image(s).",
    "Extract these fields from the same report parsing pass: retinopathy (yes/no), type, severity, findings, impression, and other findings.",
    "Only mark retinopathy as 'yes' if it is clearly stated in the report/image text.",
    "If a field is not explicitly present, keep it empty.",
    "Do not add diagnosis wording beyond what is stated in the uploaded report.",
    "Return JSON matching this schema:",
    EYE_HEALTH_SCHEMA_HINT,
    "",
    "Patient context (may help disambiguation; do not hallucinate values):",
    `name: ${name || "unknown"}`,
    `sex: ${sex || "unknown"}`,
    `age: ${age != null ? age : "unknown"}`,
    `diabetes: ${diabetes || "unknown"}`,
    `diabetesYears: ${diabetesYears != null ? diabetesYears : "unknown"}`,
    `hypertension: ${hypertension || "unknown"}`,
    "",
    "Text extracted from documents (may be empty):",
    typeof extractedText === "string" ? extractedText : ""
  ].join("\n");
}
