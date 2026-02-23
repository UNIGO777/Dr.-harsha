export const JSON_REPAIR_SYSTEM_PROMPT = `You are a JSON repair tool.

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not hallucinate new fields.`;

export function buildJsonRepairObjectUserPrompt({ schemaHint, rawText }) {
  const hint = typeof schemaHint === "string" && schemaHint.trim() ? schemaHint : "";
  const cleaned = typeof rawText === "string" ? rawText : "";
  return `${hint}

You are given a model output that was supposed to be a single JSON object, but it may be truncated or invalid.
Your job:
- Extract the largest valid JSON object you can recover.
- If there are incomplete trailing objects/arrays, drop the incomplete tail.
- Output ONE JSON object only.

[MODEL_OUTPUT]
${cleaned}`;
}

export function buildJsonRepairArrayUserPrompt({ schemaHint, rawText }) {
  const hint = typeof schemaHint === "string" && schemaHint.trim() ? schemaHint : "";
  const cleaned = typeof rawText === "string" ? rawText : "";
  return `${hint}

You are given a model output that was supposed to be a single JSON array, but it may be truncated or invalid.
Your job:
- Extract the largest valid JSON array you can recover.
- If there are incomplete trailing objects/arrays, drop the incomplete tail.
- Output ONE JSON array only.

[MODEL_OUTPUT]
${cleaned}`;
}
