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

const MAX_UPLOAD_MB = (() => {
  const raw = process.env.MAX_UPLOAD_MB;
  const n = typeof raw === "string" ? Number(raw) : null;
  if (!Number.isFinite(n) || n <= 0) return 15;
  return Math.min(Math.round(n), 50);
})();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
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

const HEART_TESTS = [
  "High Sensitivity C-Reactive Protein (HS-CRP)",
  "Total Cholesterol",
  "HDL Cholesterol",
  "LDL Cholesterol",
  "Triglycerides",
  "VLDL Cholesterol",
  "Non-HDL Cholesterol",
  "TC / HDL Ratio",
  "Triglyceride / HDL Ratio",
  "LDL / HDL Ratio",
  "HDL / LDL Ratio",
  "Lipoprotein (a) [Lp(a)]",
  "Apolipoprotein A1 (Apo-A1)",
  "Apolipoprotein B (Apo-B)",
  "Apo B / Apo A1 Ratio"
];

const URINE_TESTS = [
  "Volume",
  "Colour",
  "Appearance",
  "Specific Gravity",
  "pH",
  "Urinary Protein",
  "Urinary Glucose",
  "Urine Ketone",
  "Urinary Bilirubin",
  "Urobilinogen",
  "Bile Salt",
  "Bile Pigment",
  "Urine Blood",
  "Nitrite",
  "Leucocyte Esterase",
  "Mucus",
  "Red Blood Cells (RBC)",
  "Urinary Leucocytes (Pus Cells)",
  "Epithelial Cells",
  "Casts",
  "Crystals",
  "Bacteria",
  "Yeast",
  "Parasite",
  "Urinary Microalbumin",
  "Urine Creatinine",
  "Urine Albumin/Creatinine Ratio (UA/C)"
];

const ALLOWED_STATUSES = new Set(["LOW", "HIGH", "NORMAL", "NOT_FOUND"]);

function canonicalizeTestName(name) {
  if (!requireString(name)) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toNullOrString(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() ? value.trim() : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickFirstNumber(text) {
  if (!requireString(text)) return null;
  const match = String(text).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function parseRangeBounds(referenceRange) {
  if (!requireString(referenceRange)) return null;
  const range = String(referenceRange).trim();
  const nums = range.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const numbers = nums.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return null;

  if (numbers.length >= 2 && (range.includes("-") || range.toLowerCase().includes("to"))) {
    const min = numbers[0];
    const max = numbers[1];
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, kind: "between" };
  }

  if (range.includes("<")) {
    return { max: numbers[0], kind: "lt" };
  }
  if (range.includes(">")) {
    return { min: numbers[0], kind: "gt" };
  }

  if (numbers.length >= 2) {
    const min = numbers[0];
    const max = numbers[1];
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, kind: "between" };
  }

  return null;
}

function computeStatus({ value, referenceRange, fallbackStatus }) {
  const vText = toNullOrString(value);
  if (vText == null) return "NOT_FOUND";

  const valueNum = pickFirstNumber(vText);
  const bounds = parseRangeBounds(toNullOrString(referenceRange));
  if (valueNum == null || !bounds) {
    const s = requireString(fallbackStatus) ? String(fallbackStatus).toUpperCase() : "";
    return ALLOWED_STATUSES.has(s) ? s : "NORMAL";
  }

  if (bounds.kind === "between") {
    if (typeof bounds.min === "number" && valueNum < bounds.min) return "LOW";
    if (typeof bounds.max === "number" && valueNum > bounds.max) return "HIGH";
    return "NORMAL";
  }
  if (bounds.kind === "lt") {
    if (typeof bounds.max === "number" && valueNum > bounds.max) return "HIGH";
    return "NORMAL";
  }
  if (bounds.kind === "gt") {
    if (typeof bounds.min === "number" && valueNum < bounds.min) return "LOW";
    return "NORMAL";
  }

  const s = requireString(fallbackStatus) ? String(fallbackStatus).toUpperCase() : "";
  return ALLOWED_STATUSES.has(s) ? s : "NORMAL";
}

function buildStrictCategory(list, incoming) {
  const incomingTests = Array.isArray(incoming?.tests) ? incoming.tests : [];
  const map = new Map();
  for (const t of incomingTests) {
    const name = toNullOrString(t?.testName);
    if (!name) continue;
    map.set(canonicalizeTestName(name), t);
  }

  const tests = list.map((testName) => {
    const entry = map.get(canonicalizeTestName(testName));
    const value = toNullOrString(entry?.value);
    const unit = toNullOrString(entry?.unit);
    const referenceRange = toNullOrString(entry?.referenceRange);
    const status = computeStatus({ value, referenceRange, fallbackStatus: entry?.status });
    return {
      testName,
      value: status === "NOT_FOUND" ? null : value,
      unit: status === "NOT_FOUND" ? null : unit,
      referenceRange: status === "NOT_FOUND" ? null : referenceRange,
      status
    };
  });

  const data = tests.some((t) => t.status !== "NOT_FOUND");
  return { data, tests };
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

gptRouter.post("/heart-urine-analysis", upload.single("file"), async (req, res) => {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const file = req.file;
    if (!file || !isPdfMime(file.mimetype)) {
      return res.status(400).json({ error: "Upload a single PDF as field name 'file'." });
    }

    const systemPrompt = `You are a medical report extraction engine.

You must strictly extract test data from a medical PDF.
You must follow the provided test list exactly.
You must not skip any test.
You must not invent data.
You must not explain anything.
You must return JSON only.

If a test from the list is not present in the PDF, mark:
"value": null
"unit": null
"referenceRange": null
"status": "NOT_FOUND"`;

    const userPrompt = `Extract HEART and URINE test data from the uploaded medical PDF.

You MUST search ONLY for the following tests.

HEART TEST LIST:
- High Sensitivity C-Reactive Protein (HS-CRP)
- Total Cholesterol
- HDL Cholesterol
- LDL Cholesterol
- Triglycerides
- VLDL Cholesterol
- Non-HDL Cholesterol
- TC / HDL Ratio
- Triglyceride / HDL Ratio
- LDL / HDL Ratio
- HDL / LDL Ratio
- Lipoprotein (a) [Lp(a)]
- Apolipoprotein A1 (Apo-A1)
- Apolipoprotein B (Apo-B)
- Apo B / Apo A1 Ratio

URINE TEST LIST:
- Volume
- Colour
- Appearance
- Specific Gravity
- pH
- Urinary Protein
- Urinary Glucose
- Urine Ketone
- Urinary Bilirubin
- Urobilinogen
- Bile Salt
- Bile Pigment
- Urine Blood
- Nitrite
- Leucocyte Esterase
- Mucus
- Red Blood Cells (RBC)
- Urinary Leucocytes (Pus Cells)
- Epithelial Cells
- Casts
- Crystals
- Bacteria
- Yeast
- Parasite
- Urinary Microalbumin
- Urine Creatinine
- Urine Albumin/Creatinine Ratio (UA/C)

For EACH test return:
- testName
- value
- unit
- referenceRange
- status

Status Rules:
- If value < range \u2192 LOW
- If value > range \u2192 HIGH
- If within range \u2192 NORMAL
- If test not present \u2192 NOT_FOUND

CATEGORY RULE:
- If ALL heart tests are NOT_FOUND \u2192 heart.data = false
- If ALL urine tests are NOT_FOUND \u2192 urine.data = false
- Else \u2192 data = true

FINAL JSON FORMAT ONLY:

{
  "heart": {
    "data": true | false,
    "tests": [
      {
        "testName": "",
        "value": "",
        "unit": "",
        "referenceRange": "",
        "status": ""
      }
    ]
  },
  "urine": {
    "data": true | false,
    "tests": [
      {
        "testName": "",
        "value": "",
        "unit": "",
        "referenceRange": "",
        "status": ""
      }
    ]
  }
}

Do not add extra keys.
Do not add text.
Return JSON only.`;

    const parsed = await pdfParse(file.buffer);
    const extractedText = typeof parsed?.text === "string" ? parsed.text.trim() : "";

    let content = "";
    if (extractedText) {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
          { role: "user", content: `${userPrompt}\n\n[PDF_TEXT]\n${extractedText}` }
        ]
      });
      content = completion.choices?.[0]?.message?.content ?? "";
    } else {
      const base64 = file.buffer.toString("base64");
      const fileDataUrl = `data:application/pdf;base64,${base64}`;
      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        text: { format: { type: "json_object" } },
        input: [
          { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
          {
            role: "user",
            content: [
              { type: "input_file", filename: file.originalname || "report.pdf", file_data: fileDataUrl },
              { type: "input_text", text: userPrompt }
            ]
          }
        ]
      });
      content = getTextFromResponsesOutput(response);
    }

    const parsedJson = safeParseJsonObject(content) ?? {};
    const heart = buildStrictCategory(HEART_TESTS, parsedJson.heart);
    const urine = buildStrictCategory(URINE_TESTS, parsedJson.urine);

    res.json({ heart, urine });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
