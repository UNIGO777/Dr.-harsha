import express from "express";
import multer from "multer";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import crypto from "node:crypto";

function requireString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getOpenAIClient() {
  if (!requireString(process.env.OPENAI_API_KEY)) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function parseMaybeJson(value) {
  if (!requireString(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseMaybeNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getTextFromMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

function getTextFromResponsesOutput(response) {
  if (requireString(response?.output_text)) return response.output_text;
  const output = response?.output;
  if (!Array.isArray(output)) return "";

  const texts = [];
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") texts.push(part.text);
      else if (part?.type === "text" && typeof part.text === "string") texts.push(part.text);
    }
  }

  return texts.join("\n");
}

function isImageMime(mime) {
  return (
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/webp"
  );
}

function isPdfMime(mime) {
  return mime === "application/pdf";
}

function isDocxMime(mime) {
  return mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 6
  }
});

export const gptRouter = express.Router();

gptRouter.post("/gpt", upload.array("files", 6), async (req, res) => {
  try {
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
            : "Please help with the attached files."
        : requireString(prompt)
          ? prompt
          : "Please help with the attached files.";

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
      model: requireString(model)
        ? model
        : process.env.OPENAI_MODEL || "gpt-4o-mini",
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
});

function safeParseJsonObject(text) {
  if (!requireString(text)) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function stripBrandingFromAdvancedBodyCompositionPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const report = payload.report;
  if (!report || typeof report !== "object" || Array.isArray(report)) return payload;

  const next = { ...payload, report: { ...report } };
  next.report.brand = null;
  next.report.deviceCode = null;
  next.report.title = "Body Composition Analysis Report";
  return next;
}

gptRouter.post("/advanced-body-composition", upload.single("file"), async (req, res) => {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const file = req.file;
    if (!file || !isPdfMime(file.mimetype)) {
      return res.status(400).json({ error: "Upload a single PDF as field name 'file'." });
    }

    const parsed = await pdfParse(file.buffer);
    const extractedText = typeof parsed?.text === "string" ? parsed.text.trim() : "";
    const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());

    const schemaHint = [
      "Return ONLY valid JSON. Do not include markdown.",
      "Extract values from the body composition report and fill what you can; use null if missing.",
      "Use numbers (not strings) for numeric values.",
      "",
      "Return JSON with this structure:",
      "{",
      '  "requestId": string,',
      '  "report": {',
      '    "title": string|null,',
      '    "deviceCode": string|null,',
      '    "brand": string|null,',
      '    "person": { "id": string|null, "heightCm": number|null, "age": number|null, "gender": string|null, "testDateTime": string|null },',
      '    "score": number|null,',
      '    "bodyComposition": {',
      '      "totalBodyWater": { "value": number|null, "unit": string|null, "rangeText": string|null },',
      '      "protein": { "value": number|null, "unit": string|null, "rangeText": string|null },',
      '      "mineral": { "value": number|null, "unit": string|null, "rangeText": string|null },',
      '      "bodyFatMass": { "value": number|null, "unit": string|null, "rangeText": string|null },',
      '      "summary": {',
      '        "totalBodyWater": { "value": number|null, "unit": string|null, "rangeText": string|null },',
      '        "softLeanMass": { "value": number|null, "unit": string|null, "rangeText": string|null },',
      '        "fatFreeMass": { "value": number|null, "unit": string|null, "rangeText": string|null },',
      '        "weight": { "value": number|null, "unit": string|null, "rangeText": string|null }',
      "      }",
      "    },",
      '    "muscleFatAnalysis": {',
      '      "weightKg": number|null,',
      '      "skeletalMuscleMassKg": number|null,',
      '      "bodyFatMassKg": number|null',
      "    },",
      '    "obesityAnalysis": {',
      '      "bmi": number|null,',
      '      "percentBodyFat": number|null,',
      '      "waistHipRatio": number|null,',
      '      "obesityRate": number|null,',
      '      "bmiClass": string|null,',
      '      "pbfClass": string|null',
      "    },",
      '    "weightControl": {',
      '      "targetWeightKg": number|null,',
      '      "weightControlKg": number|null,',
      '      "fatControlKg": number|null,',
      '      "muscleControlKg": number|null',
      "    },",
      '    "segmentalLean": {',
      '      "rightArm": { "kg": number|null, "pct": number|null },',
      '      "leftArm": { "kg": number|null, "pct": number|null },',
      '      "trunk": { "kg": number|null, "pct": number|null },',
      '      "rightLeg": { "kg": number|null, "pct": number|null },',
      '      "leftLeg": { "kg": number|null, "pct": number|null }',
      "    },",
      '    "segmentalMuscle": {',
      '      "rightArmKg": number|null, "leftArmKg": number|null, "trunkKg": number|null, "rightLegKg": number|null, "leftLegKg": number|null',
      "    },",
      '    "segmentalFat": {',
      '      "rightArmKg": number|null, "leftArmKg": number|null, "trunkKg": number|null, "rightLegKg": number|null, "leftLegKg": number|null',
      "    },",
      '    "research": { "basalMetabolicRateKcal": number|null, "visceralFatArea": number|null },',
      '    "impedance": {',
      '      "freq50kHz": { "rightArm": number|null, "leftArm": number|null, "trunk": number|null, "rightLeg": number|null, "leftLeg": number|null },',
      '      "freq250kHz": { "rightArm": number|null, "leftArm": number|null, "trunk": number|null, "rightLeg": number|null, "leftLeg": number|null }',
      "    }",
      "  }",
      "}"
    ].join("\n");

    if (extractedText) {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You extract structured data from a Body Composition Analysis Report in JSON." },
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
          content: "You extract structured data from a Body Composition Analysis Report in JSON."
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
});
