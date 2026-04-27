export const CANCER_SCREENING_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract cancer screening related tests and summaries from the provided document/image/text.",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "If a field is not present, use null or empty string as appropriate.",
  "Be conservative: only extract values that are clearly stated."
].join("\n");

export const CANCER_SCREENING_SCHEMA_HINT = `{
  "cancerScreening": {
    "summary": "",
    "psa": {
      "total": { "done": "", "value": null, "unit": "ng/mL", "date": "", "summary": "" },
      "free": { "done": "", "value": null, "unit": "", "date": "", "summary": "" }
    },
    "afp": { "done": "", "value": null, "unit": "", "date": "", "summary": "" },
    "ca125": { "done": "", "value": null, "unit": "", "date": "", "summary": "" },
    "cea": { "done": "", "value": null, "unit": "", "date": "", "summary": "" },
    "bloodCancerPanel": { "done": "", "summary": "" },
    "stoolOccultBloodTest": { "done": "", "result": "", "date": "", "summary": "" },
    "lowDoseHrctChest": { "done": "", "summary": "" },
    "ultraPremium50plus": { "done": "", "summary": "" },
    "notes": []
  }
}`;

export function buildCancerScreeningUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  return [
    "Extract the CANCER SCREENING section from the attached report(s)/image(s).",
    "Output JSON matching this schema:",
    CANCER_SCREENING_SCHEMA_HINT,
    "",
    "Rules:",
    "- summary: a short overall plain-text summary of all cancer screening findings (1-3 sentences, no markdown).",
    "- done must be 'yes' | 'no' | '' (empty string if unknown).",
    "- value must be a number if clearly stated; otherwise null.",
    "- date can be 'YYYY-MM-DD' if clearly stated; otherwise empty string.",
    "- summary should be a short plain-text summary of the report finding for that test (no markdown).",
    "- If you see synonymous names, map them:",
    "  - Total PSA: 'Total PSA', 'PSA', 'Prostate Specific Antigen' (if clearly total).",
    "  - Free PSA: 'Free PSA', '% Free PSA' (capture numeric if available, keep unit).",
    "  - AFP: 'Alpha-fetoprotein', 'Alfa feto protein'.",
    "  - CA125: 'CA-125'.",
    "  - CEA: 'Carcinoembryonic Antigen'.",
    "  - Stool occult blood test: 'FOBT', 'FIT', 'Stool occult blood'.",
    "  - HRCT: 'Low dose HRCT chest', 'LDCT chest' (capture impression/summary).",
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

