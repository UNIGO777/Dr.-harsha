export const DOCS_TESTS_CLEAN_SYSTEM_PROMPT = `You are a medical report data cleaner and extractor.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.`;

export const DOCS_TESTS_CLEAN_SCHEMA_HINT = `Schema: {"tests":[{"categoryName":"","tests":[{"testName":"","results":[{"value":"","dateAndTime":null}],"unit":null,"referenceRange":null,"status":"","section":null,"page":null,"remarks":null}]}]}`;

export function buildDocsTestsCleanUserPrompt({ dictionaryPrompt, rowsForPrompt }) {
  return `Input: Raw OCR/text extracted from a lab report table (may contain noise, descriptions, broken rows, and mixed urine/blood tests).

Your job:
- Identify and extract ONLY real medical test entries (lab parameters).
- Clean and normalize the data.
- Remove explanatory paragraphs and irrelevant text.
- Standardize status values (Normal, High, Low, Absent, Present).
- Preserve values EXACTLY as provided in the input rows:
  - Copy each "results[].value" character-for-character (do not round, do not change decimal places, do not drop trailing zeros).
  - Preserve comparison symbols like "<", ">", "≤", "≥" when they are part of the value or referenceRange.
  - Do NOT move "Technology/Method" text (e.g., "ICP-MS", "HPLC") into testName, value, unit, or referenceRange.
- If the result says "ABSENT", store result as "Absent".
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
   - Use "results" array, each item includes { value, dateAndTime }.
   - If you see the same testName multiple times with different dateAndTime, merge them under the same testName with multiple "results" entries.
   - If dateAndTime is missing, set it to null.
   - Do NOT invent dates/times.
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
            { "value": string, "dateAndTime": string|null }
          ],
          "unit": string|null,
          "referenceRange": string|null,
          "status": "Normal"|"High"|"Low"|"Absent"|"Present",
          "section": string|null,
          "page": number|null,
          "remarks": string|null
        }
      ]
    }
  ]
}`;
}
