export const DOCS_TESTS_CLEAN_SYSTEM_PROMPT = `You are a medical report data cleaner and extractor.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.`;

export const DOCS_TESTS_CLEAN_SCHEMA_HINT = `Schema: {"tests":[{"categoryName":"","tests":[{"testName":"","results":[{"value":"","dateAndTime":null,"status":"LOW|HIGH|NORMAL|ABSENT|PRESENT"}],"unit":null,"referenceRange":null,"section":null,"page":null,"remarks":null}]}]}`;

export function buildDocsTestsCleanUserPrompt({ dictionaryPrompt, rowsForPrompt }) {
  return `Input: Raw OCR/text extracted from a lab report table (may contain noise, descriptions, broken rows, and mixed urine/blood tests).

Your job:
- Identify and extract ONLY real medical test entries (lab parameters).
- Clean and normalize the data.
- Remove explanatory paragraphs and irrelevant text.
- For every "results" entry, set "status" by comparing that "value" to the test's "referenceRange":
  - If value is within range, status = "NORMAL"
  - If value is below range, status = "LOW"
  - If value is above range, status = "HIGH"
  - If value is a qualitative result (e.g. "Absent"/"Present") or cannot be compared to referenceRange, use status "ABSENT" or "PRESENT" when appropriate, otherwise use "NORMAL".
- Preserve values EXACTLY as provided in the input rows:
  - Copy each "results[].value" character-for-character (do not round, do not change decimal places, do not drop trailing zeros).
  - Preserve comparison symbols like "<", ">", "≤", "≥" when they are part of the value or referenceRange.
  - Do NOT move "Technology/Method" text (e.g., "ICP-MS", "HPLC") into testName, value, unit, or referenceRange.
- Do NOT change the spelling/case of qualitative values in "results[].value" (e.g. keep "Absent" exactly), but set "results[].status" using the uppercase enum values.
- Drop rows that are NOT medical tests (interpretation / classification / ranges / labels / address blocks).
- Examples of rows to DROP: "Normal", "Prediabetic", "Good Control", "Fair Control", "Unsatisfactory Control", "c values", "to 125 mg/dl", "or higher", and pure range/category lines.
- Keep medical parameters even if they are not in the dictionary, as long as they are clearly medical (have unit/referenceRange/section/remarks or are common lab parameters).
- Test name normalization is critical:
  - Replace long/verbose titles with a concise industry-standard test name.
  - Do NOT include units, reference ranges, or extra explanatory words inside testName.
  - Do NOT include technology/method terms (e.g., "ICP-MS", "HPLC", "ELISA") inside testName.
  - Prefer 1–3 words when possible, but if the industry-standard name is longer, keep the standard name.
  - If the test exists in the dictionary, set testName to EXACTLY one of the dictionary test names (copy spelling as-is) and pick the shortest standard variant.
  - If the test does not exist in the dictionary, keep the original testName unchanged (do not invent a new name).
 - Group the cleaned tests into medical categories. Use a short human-friendly category name (2–6 words), like "Renal & Electrolyte Profile", "Lipid Profile", "Liver Function", "Thyroid", "Complete Blood Count", "Diabetes", "Urine Routine", "Vitamins", "Hormones", "Inflammation", "Others".
 - Put similar tests together in the same category. Avoid too many categories.
 - If a test already has a good "section" value in the input, you may use it to decide the categoryName.
 - Preserve multiple measurements for the same test across different dates/times:
   - Use "results" array, each item includes { value, dateAndTime, status }.
   - If you see the same testName multiple times with different dateAndTime, merge them under the same testName with multiple "results" entries.
   - If dateAndTime is missing, set it to null.
   - Do NOT invent dates/times.
 - Deduplicate repeated results for the same date:
   - If the same testName has multiple results on the SAME DATE with the SAME value (even if time differs), keep ONLY ONE entry.
   - If the same testName has multiple results on the SAME DATE with DIFFERENT values, keep multiple entries.
   - When removing duplicates on the same date, keep only the first occurrence (earliest time if available).
 - Avoid duplicate tests across categories:
   - Each testName must appear in ONLY ONE category in the final output.
   - If you accidentally place the same testName in multiple categories, keep it in the best matching category and REMOVE it from the others.
   - If two categories end up having a large overlap of the same tests, merge them into ONE category (choose the most appropriate categoryName).
 - Deduplication rules (IMPORTANT):
   - Within each category, do NOT output duplicate testName rows. If the same testName appears multiple times, merge into ONE row.
   - Do NOT output placeholder rows where value is missing/"not presented"/"not found"/"NA" and referenceRange is missing/"not presented".
   - If you see a duplicate testName where one row has a real value and another row is "not presented", keep ONLY the real one (merge results if needed).

Medical dictionary (valid test names):
${dictionaryPrompt}

Input rows (JSON array):
${rowsForPrompt}

Return clean JSON ONLY with this structure:
{
  "tests": [
    {
      "categoryName": string,
      "tests": [
        {
          "testName": string,
          "results": [
            { "value": string, "dateAndTime": string|null, "status": "LOW"|"HIGH"|"NORMAL"|"ABSENT"|"PRESENT" }
          ],
          "unit": string|null,
          "referenceRange": string|null,
          "section": string|null,
          "page": number|null,
          "remarks": string|null
        }
      ]
    }
  ]
}`;
}
