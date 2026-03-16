export const BRAIN_HEALTH_ASSESSMENT_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract brain health assessment findings from uploaded documents (Carotid Doppler, MRI Brain, and related reports).",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "Be conservative: only extract values that are clearly present in the report."
].join("\n");

export const BRAIN_HEALTH_ASSESSMENT_SCHEMA_HINT = `{
  "brainHealthAssessment": {
    "carotidDoppler": {
      "category": "",
      "reportedAt": "",
      "summary": "",
      "findings": {
        "cimt": "",
        "plaque": "",
        "stenosis": ""
      }
    },
    "mriBrain": {
      "category": "",
      "reportedAt": "",
      "summary": "",
      "findings": {
        "whiteMatterHyperintensities": "",
        "silentInfarcts": "",
        "brainAtrophy": ""
      }
    },
    "geneticTesting": {
      "apoe": "",
      "lrrk2": ""
    },
    "notes": []
  }
}`;

export function buildBrainHealthAssessmentUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  return [
    "Extract brain health assessment findings from the attached report(s)/image(s).",
    "This may include: Carotid Doppler (brain arteries), MRI Brain, and genetic testing reports.",
    "",
    "Output JSON matching this schema:",
    BRAIN_HEALTH_ASSESSMENT_SCHEMA_HINT,
    "",
    "Rules:",
    "- If a section is not present, keep it as empty strings / empty arrays.",
    "- 'category' should be a short label like Normal / Abnormal if stated or clearly implied.",
    "- For Carotid Doppler: extract CIMT, plaque, stenosis only if explicitly present.",
    "- For MRI Brain: extract white matter hyperintensities, silent infarcts, brain atrophy only if explicitly present.",
    "- Keep strings as-is from the report; do not compute or infer risk scores.",
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

