export const ARTERIAL_HEALTH_SYSTEM_PROMPT = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return markdown.
Do not add any medical assessment or extra interpretation.
Only extract values and interpretations that are explicitly written in the report.`;

export const ARTERIAL_HEALTH_SCHEMA_HINT = `{
  "basicVitals": [
    { "parameter": "", "observedValue": "", "units": "", "interpretation": "" }
  ],
  "centralAorticPressure": [
    { "parameter": "", "observedValue": "", "observedUnits": "", "normalValue": "", "normalUnits": "", "interpretation": "" }
  ],
  "pulseWaveVelocity": [
    { "parameter": "", "observedValue": "", "observedUnits": "", "normalValue": "", "normalUnits": "", "interpretation": "" }
  ],
  "arterialStiffnessIndex": [
    { "parameter": "", "observedValue": "", "observedUnits": "", "normalRange": "", "interpretation": "" }
  ],
  "ankleBrachialIndex": [
    { "parameter": "", "observedValue": "", "normalRange": "", "interpretation": "" }
  ],
  "ecgTiming": [
    { "parameter": "", "value": "", "units": "", "notes": "" }
  ],
  "summaries": {
    "estimatedFunctionalVascularAge": "",
    "cardiovascularRiskGrade": "",
    "withFindings": [],
    "otherNotes": []
  }
}`;

export function buildArterialHealthUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const t = typeof extractedText === "string" ? extractedText : "";

  return `Extract ALL arterial health / vascular stiffness / ABI / PWV / central aortic pressure parameters from the uploaded report.

Rules:
- Copy the report's own interpretation text exactly when present.
- Do NOT add your own assessment, scoring, or advice.
- If a section is not present, return an empty array (or empty strings for summaries) for that section.
- Prefer structured extraction over free text.
- Ignore educational content, formulas, citations, and instructions that are not part of the patient's measured results.

Patient (may be incomplete):
${JSON.stringify(p)}

Report text (may be partial):
${t}

Return ONLY valid JSON in this exact shape:
${ARTERIAL_HEALTH_SCHEMA_HINT}`;
}

