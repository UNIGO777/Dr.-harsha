export const URINOGRAM_PHYSICAL_EXAM_TESTS = ["Volume", "Colour", "Appearance", "Specific Gravity", "pH"];

export const URINOGRAM_CHEMICAL_EXAM_TESTS = [
  "Urinary Protein",
  "Urinary Glucose",
  "Urine Ketone",
  "Urinary Bilirubin",
  "Urobilinogen",
  "Bile Salt",
  "Bile Pigment",
  "Urine Blood",
  "Nitrite",
  "Leucocyte Esterase"
];

export const URINOGRAM_MICROSCOPIC_EXAM_TESTS = [
  "Mucus",
  "Red Blood Cells",
  "Urinary Leucocytes (Pus Cells)",
  "Epithelial Cells",
  "Casts",
  "Crystals",
  "Bacteria",
  "Yeast",
  "Parasite"
];

export const URINOGRAM_ANCHOR_TERMS = [
  "Complete Urinogram",
  "Urinogram",
  "Microscopic Examination",
  "Chemical Examination",
  "Urinary Protein",
  "Urinary Glucose"
];

export function buildUrinogramUserPrompt({ bulletList }) {
  return `Extract ALL urinary test parameters from the medical report exactly as shown in the "Complete Urinogram" section.

Include:

Physical Examination:
${bulletList(URINOGRAM_PHYSICAL_EXAM_TESTS)}

Chemical Examination:
${bulletList(URINOGRAM_CHEMICAL_EXAM_TESTS)}

Microscopic Examination:
${bulletList(URINOGRAM_MICROSCOPIC_EXAM_TESTS)}

Strict JSON format:
{
  "urine_tests": [
    {
      "test_name": "",
      "methodology": "",
      "observed_value": "",
      "units": "",
      "reference_range": "",
      "status": ""
    }
  ]
}

Rules:
- If value matches reference range → status = "Normal"
- If value deviates → status = "Abnormal"
- If reference is text like "Absent" or "Clear", compare accordingly
- Preserve text like "Present 1+(100-250 mg/dl)" exactly
- If a parameter is not found, include it with:
  - observed_value = "Not included in the PDF"
  - methodology = ""
  - units = ""
  - reference_range = ""
  - status = "Not included in the PDF"
- Output must be valid JSON only.`;
}
