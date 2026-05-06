export const ELDER_HEALTH_SYSTEM_PROMPT = [
  "You are a medical report extraction engine specializing in geriatric health assessments.",
  "Extract elder health assessment data from the provided documents (PDFs, DOCX, or images).",
  "Documents may include: DEXA bone density reports, FRAX fracture risk reports, fall risk assessment forms, Berg's Balance Scale assessments, audiograms, Clinical Frailty Scale assessments, Mini-Cog / MoCA cognitive screening results, APO E genotyping reports, and Alzheimer disease screening profiles.",
  "Return ONLY valid JSON. Do not add markdown fences or commentary.",
  "If a field is absent from the documents, use null for numbers and empty string for text.",
  "Be conservative: only extract values that are clearly stated in the documents.",
  "For yes/no fields use exactly 'yes' or 'no' (lowercase).",
  "For hearingLevel use one of: 'Normal', 'Mild', 'Moderate', 'Severe'.",
  "For fallRiskCategory use one of: 'Low', 'Moderate', 'High'."
].join("\n");

const ELDER_HEALTH_SCHEMA = `{
  "dexa": {
    "femoralNeckBmdGcm2": null,
    "femoralNeckTScore": null,
    "totalHipTScore": null,
    "lumbarSpineTScore": null,
    "impression": ""
  },
  "frax": {
    "majorOsteoporotic10yPct": null,
    "hip10yPct": null,
    "country": "",
    "priorFragilityFracture": "",
    "parentalHipFracture": "",
    "glucocorticoids": "",
    "rheumatoidArthritis": "",
    "secondaryOsteoporosis": ""
  },
  "falls": {
    "fallsInPastYear": "",
    "fallsCountPastYear": null,
    "fallRiskCategory": "",
    "fallRiskSummary": ""
  },
  "berg": {
    "bergBalanceScore": null,
    "bergSummary": ""
  },
  "frailty": {
    "clinicalFrailtyScore": null
  },
  "audiogram": {
    "hearingLevel": "",
    "summary": ""
  },
  "cognition": {
    "miniCogScore": null,
    "mocaScore": null
  },
  "apoE": {
    "result": ""
  },
  "alzheimerCsf": {
    "result": ""
  },
  "alzheimerBlood": {
    "result": ""
  },
  "overallImpression": "",
  "notes": []
}`;

export function buildElderHealthUserPrompt({ patient, extractedText }) {
  const lines = [];

  if (patient && (patient.name || patient.age || patient.sex)) {
    lines.push("=== PATIENT ===");
    if (patient.name) lines.push(`Name: ${patient.name}`);
    if (patient.age) lines.push(`Age: ${patient.age}`);
    if (patient.sex) lines.push(`Sex: ${patient.sex}`);
    lines.push("");
  }

  if (extractedText && extractedText.trim()) {
    lines.push("=== DOCUMENT TEXT ===");
    lines.push(extractedText.trim());
    lines.push("");
  }

  lines.push("=== INSTRUCTIONS ===");
  lines.push("Extract all elder health assessment values found in the documents. Look for:");
  lines.push("- DEXA bone density: T-scores for femoral neck, total hip, lumbar spine, BMD values, and radiologist impression");
  lines.push("- FRAX: 10-year major osteoporotic fracture %, 10-year hip fracture %, country/model, and risk factors (yes/no)");
  lines.push("- Fall risk: history of falls (yes/no), fall count, overall risk category, and assessment summary text");
  lines.push("- Berg's Balance Scale: total score (0–56) and any documented interpretation");
  lines.push("- Clinical Frailty Scale: score (1–9)");
  lines.push("- Audiogram: hearing level classification (Normal/Mild/Moderate/Severe) and findings summary");
  lines.push("- Cognition: Mini-Cog score (0–5) and/or MoCA score (0–30)");
  lines.push("- APO E genotyping: genotype and interpretation");
  lines.push("- Alzheimer CSF profile: biomarker results and interpretation");
  lines.push("- Alzheimer Blood profile: biomarker results and interpretation");
  lines.push("- Overall clinical impression from the reports");
  lines.push("");
  lines.push("=== EXPECTED JSON SCHEMA ===");
  lines.push(ELDER_HEALTH_SCHEMA);

  return lines.join("\n");
}
