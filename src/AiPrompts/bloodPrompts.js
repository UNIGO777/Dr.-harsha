export const BLOOD_TEXT_USER_PROMPT = `Read the report text systematically (in order). Treat it like reading the PDF page-by-page.

Extract EVERY single parameter/value row you can find, including:
- Ratios and derived values
- Any "Physical Examination", "Chemical Examination", "Microscopy", "Impression", "Remarks" style values
- Any lab table line-items (even if they are not typical blood markers)

Rules:
- Extract ONLY what is actually present with an observed value in the report text.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written.
- If unit/range/remarks are missing, set them to null.
- Prefer one row per distinct parameter occurrence; dedupe only if exact duplicates.

Status rules:
- If referenceRange is available AND value is numeric (or contains a numeric), set status to LOW/HIGH/NORMAL accordingly.
- Otherwise set status to NORMAL.

Self-audit before returning JSON:
- Page/order check: confirm you processed the text from start to end without skipping blocks.
- Status verification: confirm any LOW/HIGH assignment is supported by the reference range.
- Count check: ensure tests.length matches the number of extracted line-items (no obvious omissions).

Important output constraint:
- Keep output compact to avoid truncation.
- Return at most 120 tests for this chunk.

Return ONLY valid JSON with this structure (no extra wrapper text):
{
  "meta": {
    "pagesAudited": number|null,
    "parametersExtracted": number,
    "qualityChecklist": {
      "pageCountChecked": boolean,
      "statusVerified": boolean,
      "countChecked": boolean,
      "noHallucinations": boolean,
      "deduped": boolean
    }
  },
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

export const BLOOD_SCHEMA_HINT = `Schema:
{
  "tests": [
    { "testName": string, "value": string, "unit": string|null, "referenceRange": string|null, "status": "LOW"|"HIGH"|"NORMAL", "section": string|null, "page": number|null, "remarks": string|null }
  ]
}`;

export const BLOOD_TEXT_FALLBACK_CLAUDE_USER_PROMPT = `Extract ONLY medical test / lab parameter rows from the report text.

Hard exclusions (do NOT extract these even if they contain numbers):
- Patient address, phone, email, name, age, gender
- Lab / hospital address, doctor address, billing details
- IDs (patient id, sample id, barcode), page headers/footers
- Any location/address line (e.g. contains Floor/Block/Road/Nagar/Bangalore/Pincode)

Rules:
- Extract ONLY line-items that are clearly medical test parameters (analytes, hormones, antibodies, ratios, urinalysis line-items, etc).
- Each extracted row MUST have an observed value for the parameter.
- Ignore serial numbers / row indices.
- If unit/referenceRange/section/page/remarks are missing, set them to null.
- If you are unsure whether a row is a medical test, exclude it.
- Keep value text exactly as written.

Return JSON only:
{
  "tests": [
    { "testName": "", "value": "", "unit": null, "referenceRange": null, "status": "NORMAL", "section": null, "page": null, "remarks": null }
  ]
}`;

export const BLOOD_IMAGES_USER_PROMPT = `Read the report images and accompanying extracted text systematically (page-by-page).

Extract EVERY single parameter/value row you can find, including:
- Ratios and derived values
- Any "Physical Examination", "Chemical Examination", "Microscopy", "Impression", "Remarks" style values
- Any lab table line-items (even if they are not typical blood markers)

Rules:
- Extract ONLY what is actually present with an observed value in the images/text.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written.
- If unit/range/remarks are missing, set them to null.
- Prefer one row per distinct parameter occurrence; dedupe only if exact duplicates.

Status rules:
- If referenceRange is available AND value is numeric (or contains a numeric), set status to LOW/HIGH/NORMAL accordingly.
- Otherwise set status to NORMAL.

Self-audit before returning JSON:
- Page/order check: confirm you processed the content sequentially.
- Status verification: confirm any LOW/HIGH assignment is supported by the reference range.
- Count check: ensure tests.length matches the number of extracted line-items (no obvious omissions).

Important output constraint:
- Keep output compact to avoid truncation.
- Return at most 120 tests for this chunk.

Return ONLY valid JSON with this structure (no extra wrapper text):
{
  "meta": {
    "pagesAudited": number|null,
    "parametersExtracted": number,
    "qualityChecklist": {
      "pageCountChecked": boolean,
      "statusVerified": boolean,
      "countChecked": boolean,
      "noHallucinations": boolean,
      "deduped": boolean
    }
  },
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;
