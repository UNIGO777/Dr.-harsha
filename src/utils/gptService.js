import OpenAI from "openai";

let cachedOpenAiClient = null;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(text) {
  const trimmed = normalizeText(text);
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {}
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  return null;
}

export function buildPromptSections(sections = []) {
  return sections
    .map((section) => {
      if (!section) return "";

      if (typeof section === "string") {
        return normalizeText(section);
      }

      const label = normalizeText(section.label);
      const value = normalizeText(section.value);
      if (!label && !value) return "";
      if (!label) return value;
      if (!value) return label;
      return `${label}: ${value}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function getGptClient() {
  if (cachedOpenAiClient) return cachedOpenAiClient;

  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  cachedOpenAiClient = new OpenAI({ apiKey });
  return cachedOpenAiClient;
}

export async function generateGptText({
  systemPrompt,
  userPrompt,
  messages,
  model,
  temperature = 0.6
}) {
  const client = getGptClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const normalizedMessages = Array.isArray(messages) && messages.length > 0
    ? messages
    : [
        { role: "system", content: normalizeText(systemPrompt) },
        { role: "user", content: normalizeText(userPrompt) }
      ].filter((message) => normalizeText(message.content));

  if (normalizedMessages.length === 0) {
    throw new Error("At least one GPT message is required");
  }

  const completion = await client.chat.completions.create({
    model: normalizeText(model) || process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: Number.isFinite(temperature) ? temperature : 0.6,
    messages: normalizedMessages
  });

  return {
    id: completion.id,
    model: completion.model,
    content: completion.choices?.[0]?.message?.content ?? "",
    usage: completion.usage ?? null
  };
}

export async function generateGptJson(options) {
  const response = await generateGptText(options);
  const parsed = parseJsonObject(response.content);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("GPT response is not valid JSON");
  }

  return {
    ...response,
    data: parsed
  };
}
