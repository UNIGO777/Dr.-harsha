export const ALLERGY_PANELS_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract allergy panel results (Phadiatop / ELISA food panels / comprehensive allergy panels).",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "Be conservative: only extract values that are clearly present in the report."
].join("\n");

export const ALLERGY_PANELS_SCHEMA_HINT = `{
  "allergyPanels": {
    "panels": [
      {
        "name": "",
        "reportedAt": "",
        "summary": "",
        "tests": [
          {
            "name": "",
            "value": "",
            "unit": "",
            "class": "",
            "referenceRange": "",
            "flag": "",
            "interpretation": ""
          }
        ]
      }
    ],
    "notes": []
  }
}`;

export function buildAllergyPanelsUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  return [
    "Extract allergy panel results from the attached report(s)/image(s).",
    "This may include (but is not limited to):",
    "- ALLERGY PHADIATOP ADULT",
    "- ALLERGY NON VEG FOOD PANEL (BY ELISA)",
    "- ALLERGY VEG FOOD PANEL (BY ELISA)",
    "- ALLERGY COMPREHENSIVE PANEL (BY ELISA)",
    "",
    "Output JSON matching this schema:",
    ALLERGY_PANELS_SCHEMA_HINT,
    "",
    "Rules:",
    "- Group results into panels. If a panel name is visible in the report, use it.",
    "- For each test row, capture test name and result. Include unit/class/reference/flag/interpretation when present.",
    "- Keep strings as-is from the report; do not compute or infer classes.",
    "- If multiple pages/panels are present, return multiple panels.",
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
