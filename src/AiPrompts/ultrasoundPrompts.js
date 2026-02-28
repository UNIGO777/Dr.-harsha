export const ULTRASOUND_ANCHOR_TERMS = [
  "ULTRASOUND",
  "USG",
  "ABDOMEN",
  "WHOLE ABDOMEN",
  "DATE",
  "SEX",
  "GENDER",
  "MALE",
  "FEMALE",
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

export function buildUltrasoundUserPrompt({ patientSexHint } = {}) {
  const sexHint = typeof patientSexHint === "string" ? patientSexHint.trim() : "";
  const sexLine = sexHint ? `\n\nPatient sex from basic details: ${sexHint}` : "";
  return `Extract ultrasound findings from the medical report.${sexLine}

Return ONLY valid JSON.
Do not return markdown.
Do not add extra keys.
If a field is not present in the report, use an empty string "".

Strict JSON format:
{
  "ultrasound": {
    "patientSex": "Male|Female|Unknown",
    "reportDate": "",
    "reportDetails": "",
    "liver": "",
    "spleen": "",
    "rightKidney": "",
    "leftKidney": "",
    "gallBladder": "",
    "urinaryBladder": "",
    "postVoidResidualUrineVolumeMl": {
      "valueMl": "",
      "details": ""
    },
    "otherFindings": []
  }
}

Rules:
- patientSex should be "Male" or "Female" if stated in the report. If not stated, use Patient sex from basic details. If still unclear, "Unknown".
- If patientSex is "Male": include "prostate" in the ultrasound object; do NOT include "uterus" and "ovaries".
- If patientSex is "Female": include "uterus" and "ovaries" in the ultrasound object; do NOT include "prostate".
- If patientSex is "Unknown": include "uterus", "ovaries", and "prostate".
- reportDate should be the study/report date if present. Prefer "YYYY-MM-DD". If unclear, leave it as "".
- reportDetails should be a short patient-friendly summary of the ultrasound report (2-6 lines).
- Keep organ fields as short extracted findings text (example: "fatty liver", "grade 2 fatty liver", "normal", "no focal lesion", etc.)
- If the report contains other ultrasound findings not covered above, add them into otherFindings as strings.
- valueMl should contain only the numeric value if present (example: "12" or "12.5"). If not present, leave it as "".
- Preserve wording from the report as much as possible.`;
}
