export const LUNG_FUNCTION_SYSTEM_PROMPT = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not add medical advice.
Only extract values explicitly present in the uploaded report.`;

export const LUNG_FUNCTION_SCHEMA_HINT = `{
  "spirometry": {
    "keyValues": {
      "fev1L": null,
      "fvcL": null,
      "fev1FvcPercent": null,
      "pef": null,
      "fef25_75": null,
      "units": {
        "pef": "",
        "fef25_75": ""
      }
    },
    "interpretation": "",
    "table": [
      {
        "parameter": "",
        "observed": "",
        "predicted": "",
        "percentPredicted": "",
        "units": "",
        "notes": ""
      }
    ],
    "notes": []
  },
  "lungAge": {
    "sexUsed": "",
    "heightCmUsed": null,
    "fev1LUsed": null,
    "lungAgeYears": null,
    "formula": ""
  },
  "chestXray": {
    "findings": "",
    "impression": ""
  },
  "hrct": {
    "findings": "",
    "impression": ""
  }
}`;

export function buildLungFunctionUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const t = typeof extractedText === "string" ? extractedText : "";

  return `Extract lung function test results from the uploaded report(s), including spirometry values (without bronchodilatation) and bronchodilator spirometry (if present).

Rules:
- Return ONLY valid JSON.
- Do NOT add your own clinical advice or conclusions.
- If a section is not present, keep it empty (nulls/empty strings/empty arrays).
- Prefer numbers for fev1L, fvcL and fev1FvcPercent.
- fev1L and fvcL must be in liters (L). If the report shows mL, convert to L.
- fev1FvcPercent should be a percent number (example: 75.99). Do not return a ratio here.
- Also extract the full table when present (parameter, observed, predicted, % predicted, units, notes).
- Extract chest X-ray and HRCT findings/impression only if explicitly included in the uploaded documents.

Patient context (for lung age calculation; may be incomplete):
${JSON.stringify(p)}

Report text (may be partial):
${t}

Return JSON in this exact shape:
${LUNG_FUNCTION_SCHEMA_HINT}`;
}
