import crypto from "node:crypto";
import pdfParse from "pdf-parse";

import {
  BODY_COMPOSITION_SCHEMA_HINT,
  BODY_COMPOSITION_SYSTEM_PROMPT
} from "../AiPrompts/bodyCompositionPrompts.js";

export function createAdvancedBodyCompositionOpenAIHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        getAiProviderFromReq,
        isPdfMime,
        safeParseJsonObject,
        safeParseJsonObjectLoose,
        stripBrandingFromAdvancedBodyCompositionPayload,
        getTextFromResponsesOutput,
        geminiGenerateContent,
        getTextFromGeminiGenerateContentResponse,
        getGeminiModel
      } = getContext();

      const provider = getAiProviderFromReq(req);
      const openai = provider === "openai" ? getOpenAIClient() : null;
      if (provider === "openai" && !openai) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      }

      const file = req.file;
      if (!file || !isPdfMime(file.mimetype)) {
        return res.status(400).json({ error: "Upload a single PDF as field name 'file'." });
      }

      const parsed = await pdfParse(file.buffer);
      const extractedText = typeof parsed?.text === "string" ? parsed.text.trim() : "";
      const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());

      const schemaHint = BODY_COMPOSITION_SCHEMA_HINT;

      if (provider === "gemini") {
        if (!extractedText) {
          return res.status(400).json({ error: "Unable to extract PDF text for Gemini." });
        }
        const response = await geminiGenerateContent({
          parts: [
            {
              text: `${BODY_COMPOSITION_SYSTEM_PROMPT}\n\n${schemaHint}\n\n[REQUEST_ID]\n${requestId}\n\n[PDF_TEXT]\n${extractedText}`
            }
          ],
          model: getGeminiModel(),
          temperature: 0,
          maxOutputTokens: 4096
        });
        const content = getTextFromGeminiGenerateContentResponse(response);
        const json = stripBrandingFromAdvancedBodyCompositionPayload(
          safeParseJsonObjectLoose(content) ?? safeParseJsonObject(content)
        );
        res.json({
          requestId,
          data: json,
          raw: json ? null : content
        });
        return;
      }

      if (extractedText) {
        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: BODY_COMPOSITION_SYSTEM_PROMPT },
            { role: "user", content: `${schemaHint}\n\n[REQUEST_ID]\n${requestId}\n\n[PDF_TEXT]\n${extractedText}` }
          ]
        });

        const content = completion.choices?.[0]?.message?.content ?? "";
        const json = stripBrandingFromAdvancedBodyCompositionPayload(safeParseJsonObject(content));

        res.json({
          requestId,
          data: json,
          raw: json ? null : content
        });
        return;
      }

      const base64 = file.buffer.toString("base64");
      const fileDataUrl = `data:application/pdf;base64,${base64}`;

      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: BODY_COMPOSITION_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: [
              { type: "input_file", filename: file.originalname || "report.pdf", file_data: fileDataUrl },
              { type: "input_text", text: `${schemaHint}\n\n[REQUEST_ID]\n${requestId}` }
            ]
          }
        ]
      });

      const content = getTextFromResponsesOutput(response);
      const json = stripBrandingFromAdvancedBodyCompositionPayload(safeParseJsonObject(content));

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
