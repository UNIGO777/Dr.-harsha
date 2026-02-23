export function buildTestsFromImagesUserPrompt({ testList }) {
  return `Extract test data from the uploaded medical report images.

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
