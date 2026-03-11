export const WOMEN_HEALTH_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract women health screening report findings from the provided document/image/text.",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "If a field is not present, use null or empty string as appropriate.",
  "Be conservative: only extract values that are clearly stated."
].join("\n");

export const WOMEN_HEALTH_SCHEMA_HINT = `{
  "womenHealth": {
    "breast": {
      "raceEthnicity": "",
      "numberOfBreastBiopsies": null,
      "atypicalHyperplasia": null,
      "firstDegreeRelativesBreastCancerCount": null,
      "personalBreastCancerHistory": null,
      "mammogramSummary": ""
    },
    "cervix": {
      "papSmearSummary": "",
      "hpvSummary": ""
    },
    "ovary": {
      "transvaginalUltrasoundSummary": "",
      "ca125": null
    },
    "uterus": {
      "endometrialThicknessMm": null,
      "endometrialBiopsySummary": ""
    },
    "notes": []
  }
}`;

export function buildWomenHealthUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  return [
    "Extract women health screening findings from the attached report(s)/image(s).",
    "Focus on: mammogram/sono-mammogram/MRI findings, Pap smear, HPV, transvaginal ultrasound, CA-125, endometrial thickness, endometrial biopsy.",
    "Return JSON matching this schema:",
    WOMEN_HEALTH_SCHEMA_HINT,
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

