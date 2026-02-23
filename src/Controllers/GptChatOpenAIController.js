import mammoth from "mammoth";
import pdfParse from "pdf-parse";

import { GPT_CHAT_DEFAULT_ATTACHMENTS_PROMPT } from "../AiPrompts/gptChatPrompts.js";

export function createGptChatOpenAIHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        parseMaybeJson,
        requireString,
        getTextFromMessageContent,
        parseMaybeNumber,
        isImageMime,
        isPdfMime,
        isDocxMime
      } = getContext();

      const openai = getOpenAIClient();
      if (!openai) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
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

      const contentParts = [{ type: "text", text: `${baseText}${pdfText}${docxText}` }];
      for (const f of imageFiles) {
        const b64 = f.buffer.toString("base64");
        const dataUrl = `data:${f.mimetype};base64,${b64}`;
        contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
      }

      const finalMessages = [...normalizedMessages];
      if (finalMessages[lastIndex]?.role === "user") {
        finalMessages[lastIndex] = { ...finalMessages[lastIndex], content: contentParts };
      } else {
        finalMessages.push({ role: "user", content: contentParts });
      }

      const completion = await openai.chat.completions.create({
        model: requireString(model) ? model : process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: parseMaybeNumber(temperature) ?? 0.2,
        messages: finalMessages
      });

      const content = completion.choices?.[0]?.message?.content ?? "";

      res.json({
        id: completion.id,
        model: completion.model,
        content,
        usage: completion.usage ?? null
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
