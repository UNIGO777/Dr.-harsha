export const DOCS_TESTS_TEXT_USER_PROMPT = `Read the report text systematically (in order), like reading the PDF page-by-page.

Goal:
- Extract ONLY medical test / lab parameter results that are present in the document (blood tests, biochemistry, immunology, hormones, urinalysis, ratios, etc).

Date/time handling:
- Find the lab report's test/collection/reported date and time (if present) anywhere in the document.
- Use that same date/time for every extracted test result in this document.
- If date/time is not found, set dateAndTime = null.
- Do NOT invent date/time.
- Deduplicate repeated results:
  - If the same testName appears multiple times on the SAME DATE with the SAME value (even if the time differs), include it ONLY ONCE.
  - If the same testName appears multiple times on the SAME DATE with DIFFERENT values, include multiple results entries.
  - When deduplicating duplicates on the same date, keep only the first occurrence (earliest time if available).
 - Output each testName ONLY ONCE in the final JSON:
   - If the same testName appears in multiple places in the report, merge into a single test object with multiple "results" entries (after applying the same-date dedup rule).

Hard exclusions (do NOT extract these even if they contain numbers):
- Patient details: name, age, sex, address, phone, email
- Lab/hospital address, branch address, doctor address
- IDs: patient id, sample id, barcode, accession no, bill no
- Page headers/footers, reference text blocks that are not results
- Any location/address line (e.g. contains Floor/Block/Road/Nagar/Bangalore/Pincode)

Row validity rules:
- Each extracted row must be a real medical parameter/test name (use your medical knowledge as a dictionary).
- Each row MUST have an observed value for that parameter.
- Ignore serial numbers / row indices.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written (do not round, do not change decimal places, do not drop trailing zeros).
- If the report shows symbols like "<", ">", "≤", "≥" as part of value or referenceRange, keep them exactly.
- If value is missing or says "not presented"/"not found"/"NA", do NOT include that row.
- If the report is in a table with columns like "TEST NAME | TECHNOLOGY/METHOD | VALUE | UNITS | REFERENCE RANGE":
  - testName must come ONLY from the test name column (no technology/method text inside testName).
  - unit must come ONLY from the units column (no test name or technology/method concatenated).
  - referenceRange must come ONLY from the reference range column.
  - If you need to keep technology/method, put it in section or remarks (not in testName/unit/value/referenceRange).
- If unit/referenceRange/section/page/remarks are missing, set them to null.
- If you are unsure whether a row is a medical test, exclude it.

Self-audit before returning JSON:
- Remove any non-medical rows (especially addresses/IDs).
- Double-check that each value is copied exactly from the report text.
- Verify LOW/HIGH is only set when supported by referenceRange for each result.

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
      "results": [
        { "value": string, "dateAndTime": string|null, "status": "LOW"|"HIGH"|"NORMAL" }
      ],
      "unit": string|null,
      "referenceRange": string|null,
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

export const DOCS_TESTS_IMAGES_USER_PROMPT = `Read the report page-by-page from the images (and extracted text) carefully.

Goal:
- Extract ONLY medical test / lab parameter results that are present in the document (blood tests, biochemistry, immunology, hormones, urinalysis, ratios, etc).

Date/time handling:
- Find the lab report's test/collection/reported date and time (if present) in the images/text.
- Use that same date/time for every extracted test result in this document.
- If date/time is not found, set dateAndTime = null.
- Do NOT invent date/time.
- Deduplicate repeated results:
  - If the same testName appears multiple times on the SAME DATE with the SAME value (even if the time differs), include it ONLY ONCE.
  - If the same testName appears multiple times on the SAME DATE with DIFFERENT values, include multiple results entries.
  - When deduplicating duplicates on the same date, keep only the first occurrence (earliest time if available).
 - Output each testName ONLY ONCE in the final JSON:
   - If the same testName appears in multiple pages/sections, merge into a single test object with multiple "results" entries (after applying the same-date dedup rule).

Hard exclusions (do NOT extract these even if they contain numbers):
- Patient details: name, age, sex, address, phone, email
- Lab/hospital address, branch address, doctor address
- IDs: patient id, sample id, barcode, accession no, bill no
- Page headers/footers, reference text blocks that are not results
- Any location/address line (e.g. contains Floor/Block/Road/Nagar/Bangalore/Pincode)

Row validity rules:
- Each extracted row must be a real medical parameter/test name (use your medical knowledge as a dictionary).
- Each row MUST have an observed value for that parameter.
- Ignore serial numbers / row indices.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written (do not round, do not change decimal places, do not drop trailing zeros).
- If the report shows symbols like "<", ">", "≤", "≥" as part of value or referenceRange, keep them exactly.
- If value is missing or says "not presented"/"not found"/"NA", do NOT include that row.
- If the report is in a table with columns like "TEST NAME | TECHNOLOGY/METHOD | VALUE | UNITS | REFERENCE RANGE":
  - testName must come ONLY from the test name column (no technology/method text inside testName).
  - unit must come ONLY from the units column (no test name or technology/method concatenated).
  - referenceRange must come ONLY from the reference range column.
  - If you need to keep technology/method, put it in section or remarks (not in testName/unit/value/referenceRange).
- If unit/referenceRange/section/page/remarks are missing, set them to null.
- Do NOT skip any row in any RESULTS table.
- If you are unsure whether a row is a medical test, exclude it.

Self-audit before returning JSON:
- Remove any non-medical rows (especially addresses/IDs).
- Double-check that each value is copied exactly as written from the report.
- Verify LOW/HIGH is only set when supported by referenceRange for each result.

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
      "results": [
        { "value": string, "dateAndTime": string|null, "status": "LOW"|"HIGH"|"NORMAL" }
      ],
      "unit": string|null,
      "referenceRange": string|null,
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}
  
`;

export const DOCS_TESTS_SCHEMA_HINT = `Schema:
{
  "tests": [
    {
      "testName": string,
      "results": [{ "value": string, "dateAndTime": string|null, "status": "LOW"|"HIGH"|"NORMAL" }],
      "unit": string|null,
      "referenceRange": string|null,
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;
