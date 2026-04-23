export const LIVER_HEALTH_SYSTEM_PROMPT = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not add medical advice.
Only extract values explicitly present in the uploaded report.`;

export const LIVER_HEALTH_SCHEMA_HINT = `{
  "liverHealth": {
    "labs": {
      "astIU_L": null,
      "altIU_L": null,
      "plateletCount10e9_L": null,
      "albuminG_dL": null,
      "triglyceridesMg_dL": null,
      "ggtIU_L": null
    },
    "anthropometry": {
      "heightCm": null,
      "weightKg": null,
      "bmiKg_m2": null,
      "waistCircumferenceCm": null
    },
    "metabolic": {
      "ifgOrDiabetes": null
    },
    "elastography": {
      "kPa": null,
      "cap": null,
      "notes": ""
    },
    "ultrasound": {
      "findings": "",
      "impression": "",
      "mentionsFattyLiver": null
    },
    "table": [
      {
        "parameter": "",
        "observed": "",
        "units": "",
        "notes": ""
      }
    ],
    "notes": []
  }
}`;

export function buildLiverHealthUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const t = typeof extractedText === "string" ? extractedText : "";

  return `Extract Liver Health inputs from the uploaded report(s) (labs, ultrasound, fibroscan/elastography).

Rules:
- Return ONLY valid JSON.
- Do NOT add your own clinical advice or conclusions.
- If a value is not explicitly present, keep it null/empty.
- Prefer numbers for all numeric fields.
- The patient context may already include diabetes/IFG and lab values from earlier steps. Use that context only for later score calculation outside this extraction. Do NOT invent or back-fill those values from context into the JSON unless the uploaded report itself explicitly shows them.
- Keep plateletCount in units of 10^9/L when possible.
- Extract elastography stiffness (kPa) only if explicitly present in the uploaded report.
- Extract CAP only if explicitly present in the uploaded report.
- Extract elastography notes/remarks only if explicitly present in the uploaded report.
- Extract ultrasound findings/impression only if explicitly present in the uploaded report.
- For ultrasound findings/impression, preserve liver-specific wording exactly as much as possible.
- Set mentionsFattyLiver only when the uploaded report clearly states fatty liver / steatosis or clearly states liver is normal.
- If the report contains a table, also extract table rows as {parameter, observed, units, notes}.
- Do NOT calculate BMI, AST/ALT ratio, NFS, FLI, FIB-4, or BARD in this extraction step.

Patient context (may be incomplete):
${JSON.stringify(p)}

Report text (may be partial):
${t}

Return JSON in this exact shape:
${LIVER_HEALTH_SCHEMA_HINT}`;
}
