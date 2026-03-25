import crypto from "node:crypto";
import pdfParse from "pdf-parse";

import {
  BODY_COMPOSITION_SCHEMA_HINT,
  BODY_COMPOSITION_SYSTEM_PROMPT
} from "../AiPrompts/bodyCompositionPrompts.js";

export function createAdvancedBodyCompositionClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        isPdfMime,
        anthropicCreateJsonMessage,
        getTextFromAnthropicMessageResponse,
        safeParseJsonObjectLoose,
        stripBrandingFromAdvancedBodyCompositionPayload
      } = getContext();

      if (!hasAnthropicKey()) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
      }

      const file = req.file;
      if (!file || !isPdfMime(file.mimetype)) {
        return res.status(400).json({ error: "Upload a single PDF as field name 'file'." });
      }

      const parsed = await pdfParse(file.buffer);
      const extractedText = typeof parsed?.text === "string" ? parsed.text.trim() : "";
      const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());

      const schemaHint = BODY_COMPOSITION_SCHEMA_HINT;

      if (!extractedText) {
        return res.status(400).json({
          error: "Could not extract readable text from this PDF for Claude. Use GPT or upload a text-based PDF."
        });
      }

      const response = await anthropicCreateJsonMessage({
        system: BODY_COMPOSITION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${schemaHint}\n\n[REQUEST_ID]\n${requestId}\n\n[PDF_TEXT]\n${extractedText}`
              }
            ]
          }
        ],
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        temperature: 0,
        maxTokens: 4096
      });

      const content = getTextFromAnthropicMessageResponse(response);
      const json = stripBrandingFromAdvancedBodyCompositionPayload(safeParseJsonObjectLoose(content));

      res.json({
        requestId,
        data: json,
        raw: json ? null : content
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
