export const EXERCISE_ASSESSMENT_SYSTEM_PROMPT = `You are a clinician preparing an exercise assessment summary.
Return ONLY valid JSON.
Do not return markdown.
Do not add extra keys.
Keep it concise and safe.
`;

export const EXERCISE_ASSESSMENT_SCHEMA_HINT = `{
  "summary": "",
  "counselling": "",
  "safetyFlags": []
}`;

export function buildExerciseAssessmentUserPrompt({ patient, assessment, computed }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const a = assessment && typeof assessment === "object" ? assessment : {};
  const c = computed && typeof computed === "object" ? computed : {};

  return `Using the provided exercise assessment inputs and computed metrics, write a short patient-friendly summary and brief counselling.
If there are any safety concerns, include them in safetyFlags as short strings.

Patient:
${JSON.stringify(p)}

Assessment inputs:
${JSON.stringify(a)}

Computed:
${JSON.stringify(c)}

Return ONLY valid JSON in this exact shape:
${EXERCISE_ASSESSMENT_SCHEMA_HINT}`;
}

