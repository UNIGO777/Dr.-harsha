export const DIET_ASSESSMENT_SYSTEM_PROMPT = `You are a clinician preparing a diet assessment summary.
Return ONLY valid JSON.
Do not return markdown.
Do not add extra keys.
Keep it concise and practical.
`;

export const DIET_ASSESSMENT_SCHEMA_HINT = `{
  "summary": "",
  "counselling": "",
  "keyIssues": [],
  "suggestedActions": []
}`;

export function buildDietAssessmentUserPrompt({ patient, assessment, computed }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const a = assessment && typeof assessment === "object" ? assessment : {};
  const c = computed && typeof computed === "object" ? computed : {};

  return `Using the provided diet assessment inputs and computed scoring, write:
1) summary: a short patient-friendly summary
2) counselling: brief counselling points
3) keyIssues: 3-8 short strings
4) suggestedActions: 3-8 short strings

Patient:
${JSON.stringify(p)}

Assessment inputs:
${JSON.stringify(a)}

Computed:
${JSON.stringify(c)}

Return ONLY valid JSON in this exact shape:
${DIET_ASSESSMENT_SCHEMA_HINT}`;
}

