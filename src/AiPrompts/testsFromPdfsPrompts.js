export const TESTS_FROM_PDFS_SYSTEM_PROMPT = `You are a medical report extraction engine.

You must strictly extract test data from medical PDF(s).
You must follow the provided test list exactly.
You must not skip any test.
You must not invent data.
You must not explain anything.
You must return JSON only.
You must extract the exact value text from the PDF(s). Do not modify the value.

If a test from the list is not present in the PDF(s), mark:
"value": null
"unit": null
"referenceRange": null
"status": "NOT_PRESENTED"`;

export function buildTestsFromPdfsUserPrompt({ testList }) {
  return `Extract test data from the uploaded medical PDF(s).

You MUST search ONLY for the following tests:

TEST LIST:
${testList}

For EACH test return:
- testName
- value
- unit
- referenceRange
- status

Status Rules:
- If value < range → LOW
- If value > range → HIGH
- If within range → NORMAL
- If test not present → NOT_PRESENTED

Return JSON ONLY with this format:
{
  "tests": [
    { "testName": "", "value": "", "unit": "", "referenceRange": "", "status": "" }
  ]
}

Do not add extra keys.
Do not add text.
Return JSON only.`;
}
