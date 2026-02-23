export const HEART_RELATED_TESTS_SYSTEM_PROMPT = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not return text outside JSON.`;

export function buildHeartRelatedTestsUserPrompt({ heartTestsList }) {
  return `Extract all heart-related tests from the medical report.

Heart-related tests include:
${heartTestsList}

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not return text outside JSON.

JSON format must be:
{
  "heart_related_tests": [
    {
      "test_name": "",
      "observed_value": "",
      "units": "",
      "reference_range": "",
      "status": ""
    }
  ]
}

Status must be one of:
"Normal", "High", "Low", "Very High", "Borderline"

If a test is not found, do not include it.`;
}
