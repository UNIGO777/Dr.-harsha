export const ULTRASOUND_ANCHOR_TERMS = [
  "ULTRASOUND",
  "USG",
  "ABDOMEN",
  "WHOLE ABDOMEN",
  "DATE",
  "LIVER",
  "SPLEEN",
  "KIDNEY",
  "GALL BLADDER",
  "URINARY BLADDER",
  "POST VOID",
  "RESIDUAL URINE",
  "UTERUS",
  "OVAR",
  "PROSTATE",
  "HERNIA",
  "FATTY LIVER"
];

export function buildUltrasoundUserPrompt() {
  return `Extract ultrasound findings from the medical report.

Return ONLY valid JSON.
Do not return markdown.
Do not add extra keys.
If a field is not present in the report, set its status to "Not included in the PDF" and keep details empty.

Strict JSON format:
{
  "ultrasound": {
    "reportDate": "",
    "reportDetails": "",
    "liver": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "spleen": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "rightKidney": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "leftKidney": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "gallBladder": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "urinaryBladder": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "postVoidResidualUrineVolumeMl": {
      "status": "Normal|Abnormal|Not included in the PDF",
      "valueMl": "",
      "details": ""
    },
    "uterus": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "ovaries": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "prostate": { "status": "Normal|Abnormal|Not included in the PDF", "details": "" },
    "otherFindings": []
  }
}

Rules:
- reportDate should be the study/report date if present. Prefer "YYYY-MM-DD". If unclear, leave it as "".
- reportDetails should be a short patient-friendly summary of the ultrasound report (2-6 lines). If everything is normal, say it clearly.
- Status must be exactly one of: "Normal", "Abnormal", "Not included in the PDF"
- Put important abnormal findings in details (example: "fatty liver", "grade 2 fatty liver", "umbilical hernia", etc.)
- If the report contains other ultrasound findings not covered above, add them into otherFindings as strings.
- valueMl should contain only the numeric value if present (example: "12" or "12.5"). If not present, leave it as "".
- Preserve wording from the report as much as possible in details.`;
}
