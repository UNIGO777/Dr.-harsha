import mammoth from "mammoth";
import pdfParse from "pdf-parse";

import { GPT_CHAT_DEFAULT_ATTACHMENTS_PROMPT } from "../AiPrompts/gptChatPrompts.js";

export function createGptChatClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        parseMaybeJson,
        requireString,
        getTextFromMessageContent,
        parseMaybeNumber,
        isImageMime,
        isPdfMime,
        isDocxMime,
        anthropicCreateJsonMessage,
        getTextFromAnthropicMessageResponse
      } = getContext();

      if (!hasAnthropicKey()) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
      }

      const { prompt, model, temperature } = req.body ?? {};
      const bodyMessages =
        Array.isArray(req.body?.messages) ? req.body.messages : parseMaybeJson(req.body?.messages);
      const messages = bodyMessages;

      const normalizedMessages = Array.isArray(messages)
        ? messages
        : requireString(prompt)
          ? [{ role: "user", content: prompt }]
          : null;

      if (!normalizedMessages) {
        return res.status(400).json({
          error: "Provide either { prompt: string } or { messages: [{role, content}] }"
        });
      }

      const files = Array.isArray(req.files) ? req.files : [];
      const imageFiles = files.filter((f) => isImageMime(f.mimetype));
      const pdfFiles = files.filter((f) => isPdfMime(f.mimetype));
      const docxFiles = files.filter((f) => isDocxMime(f.mimetype));
      const unsupportedFiles = files.filter(
        (f) => !isImageMime(f.mimetype) && !isPdfMime(f.mimetype) && !isDocxMime(f.mimetype)
      );

      if (unsupportedFiles.length > 0) {
        return res.status(400).json({
          error: `Unsupported file types: ${unsupportedFiles
            .map((f) => f.mimetype || "unknown")
            .join(", ")}`
        });
      }

      const lastIndex = normalizedMessages.length - 1;
      const lastMessage = normalizedMessages[lastIndex];

      const existingUserText =
        lastMessage?.role === "user" ? getTextFromMessageContent(lastMessage.content) : "";

      const baseText =
        lastMessage?.role === "user"
          ? requireString(existingUserText)
            ? existingUserText
            : requireString(prompt)
              ? prompt
              : GPT_CHAT_DEFAULT_ATTACHMENTS_PROMPT
          : requireString(prompt)
            ? prompt
            : GPT_CHAT_DEFAULT_ATTACHMENTS_PROMPT;

      let pdfText = "";
      for (const f of pdfFiles) {
        const data = await pdfParse(f.buffer);
        const extracted = typeof data.text === "string" ? data.text : "";
        const trimmed = extracted.trim();
        if (trimmed.length === 0) continue;
        const capped = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
        pdfText += `\n\n[PDF: ${f.originalname}]\n${capped}`;
      }

      let docxText = "";
      for (const f of docxFiles) {
        const result = await mammoth.extractRawText({ buffer: f.buffer });
        const extracted = typeof result?.value === "string" ? result.value : "";
        const trimmed = extracted.trim();
        if (trimmed.length === 0) continue;
        const capped = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
        docxText += `\n\n[DOCX: ${f.originalname}]\n${capped}`;
      }

      const anthropicContent = [{ type: "text", text: `${baseText}${pdfText}${docxText}` }];
      for (const f of imageFiles) {
        anthropicContent.push({
          type: "image",
          source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
        });
      }

      const response = await anthropicCreateJsonMessage({
        system: null,
        messages: [{ role: "user", content: anthropicContent }],
        model: requireString(model) ? model : undefined,
        temperature: parseMaybeNumber(temperature) ?? 0.2,
        maxTokens: 4096
      });

      const content = getTextFromAnthropicMessageResponse(response);
      res.json({
        id: response?.id ?? null,
        model: response?.model ?? (requireString(model) ? model : process.env.ANTHROPIC_MODEL || null),
        content,
        usage: response?.usage ?? null
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
