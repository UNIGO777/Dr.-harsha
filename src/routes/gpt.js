import express from "express";
import multer from "multer";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function collectUploadedFiles(req) {
  const uploaded = [];
  if (Array.isArray(req?.files)) uploaded.push(...req.files);
  else if (req?.files && typeof req.files === "object") {
    for (const arr of Object.values(req.files)) {
      if (Array.isArray(arr)) uploaded.push(...arr);
    }
  }
  if (req?.file) uploaded.push(req.file);
  return uploaded;
}

async function extractPdfTextForPrompt(pdfFiles) {
  const maxPdfTextChars = 50000;
  let extractedText = "";
  for (const f of pdfFiles) {
    if (extractedText.length >= maxPdfTextChars) break;
    const parsed = await pdfParse(f.buffer);
    const extracted = typeof parsed?.text === "string" ? parsed.text : "";
    const capped = capTextForPrompt(extracted, 4000);
    if (!capped) continue;
    const next = `\n\n[PDF: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxPdfTextChars);
  }
  return extractedText;
}

function getChunkParams(req) {
  const chunkIndex = parseMaybeNumber(req?.body?.chunkIndex) ?? 0;
  const chunkSize = parseMaybeNumber(req?.body?.chunkSize) ?? 150;
  return {
    chunkIndex: Math.max(0, Math.trunc(chunkIndex)),
    chunkSize: Math.max(1, Math.trunc(chunkSize))
  };
}

function sliceChunk(list, chunkIndex, chunkSize) {
  const items = Array.isArray(list) ? list : [];
  const totalChunks = Math.max(1, Math.ceil(items.length / chunkSize));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);
  const start = safeIndex * chunkSize;
  const end = start + chunkSize;
  return { safeIndex, totalChunks, chunk: items.slice(start, end) };
}

const MAX_UPLOAD_MB = (() => {
  const raw = process.env.MAX_UPLOAD_MB;
  const n = typeof raw === "string" ? Number(raw) : null;
  if (!Number.isFinite(n) || n <= 0) return 15;
  return Math.min(Math.round(n), 50);
})();

const MAX_ANALYSIS_FILES = 15;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: MAX_ANALYSIS_FILES
  }
});

export const gptRouter = express.Router();

gptRouter.post("/gpt", upload.array("files", MAX_ANALYSIS_FILES), async (req, res) => {
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

function canonicalizeTestName(name) {
  if (!requireString(name)) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uniqueTestNames(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) continue;
    const key = canonicalizeTestName(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseParametersFile(raw) {
  if (!requireString(raw)) return [];
  const lines = String(raw)
    .split(/\r?\n/g)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  const out = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("\t");
    const name = typeof parts?.[2] === "string" ? parts[2].trim() : "";
    if (!name) continue;
    out.push(name);
  }
  return uniqueTestNames(out);
}

const PARAMETERS_JSON_PATH = (() => {
  const raw = process.env.PARAMETERS_JSON_PATH;
  if (requireString(raw)) return path.resolve(raw.trim());
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../data/perameters.json");
})();

const requireModule = createRequire(import.meta.url);

const PARAMETERS_FILE_PATH = (() => {
  const raw = process.env.PARAMETERS_FILE_PATH;
  if (requireString(raw)) return path.resolve(raw.trim());
  return PARAMETERS_JSON_PATH;
})();

const PARAMETER_TESTS = (() => {
  try {
    const parsed = requireModule(PARAMETERS_JSON_PATH);
    const tests = Array.isArray(parsed?.tests) ? parsed.tests : null;
    if (tests) return uniqueTestNames(tests);
  } catch {}

  try {
    const raw = fs.readFileSync(PARAMETERS_FILE_PATH, "utf8");
    const maybeJson = safeParseJsonObject(raw);
    const tests = Array.isArray(maybeJson?.tests) ? maybeJson.tests : null;
    if (tests) return uniqueTestNames(tests);
    return parseParametersFile(raw);
  } catch {
    return [];
  }
})();

const URINE_PARAMETER_TESTS = (() => {
  const list = PARAMETER_TESTS.filter((name) => {
    const u = String(name).toUpperCase();
    return u.includes("URINE") || u.includes("URINARY");
  });
  return uniqueTestNames(list);
})();

const BLOOD_PARAMETER_TESTS = (() => {
  const urineCanon = new Set(URINE_PARAMETER_TESTS.map(canonicalizeTestName));
  const heartCanon = new Set(HEART_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (urineCanon.has(key)) continue;
    if (heartCanon.has(key)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const PARAMETER_TESTS_FOR_EXTRACTION = (() => {
  const heartCanon = new Set(HEART_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (heartCanon.has(key)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const ALLOWED_STATUSES = new Set(["LOW", "HIGH", "NORMAL", "NOT_PRESENTED", "NOT_FOUND"]);

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
  if (vText == null) {
    const s = requireString(fallbackStatus) ? String(fallbackStatus).toUpperCase() : "";
    return ALLOWED_STATUSES.has(s) ? s : "NOT_PRESENTED";
  }

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
    const missing = status === "NOT_PRESENTED" || status === "NOT_FOUND";
    return {
      testName,
      value: missing ? null : value,
      unit: missing ? null : unit,
      referenceRange: missing ? null : referenceRange,
      status
    };
  });

  const data = tests.some((t) => t.status !== "NOT_PRESENTED" && t.status !== "NOT_FOUND");
  return { data, tests };
}

function capTextForPrompt(text, maxChars) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  const headChars = Math.floor(maxChars * 0.65);
  const tailChars = maxChars - headChars;
  const head = trimmed.slice(0, headChars);
  const tail = trimmed.slice(trimmed.length - tailChars);
  return `${head}\n...\n${tail}`;
}

function bulletList(list) {
  return list.map((t) => `- ${t}`).join("\n");
}

function chunkArray(list, size) {
  const out = [];
  const n = Array.isArray(list) ? list.length : 0;
  if (!Number.isFinite(size) || size <= 0) return out;
  for (let i = 0; i < n; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  const limit =
    Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : 1;
  const results = new Array(list.length);
  let nextIndex = 0;

  const workerCount = Math.min(limit, list.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= list.length) break;
      results[i] = await mapper(list[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

function normalizeIncomingTests(incoming) {
  const tests = Array.isArray(incoming?.tests) ? incoming.tests : [];
  return tests
    .map((t) => {
      const testName = toNullOrString(t?.testName);
      if (!testName) return null;
      return {
        testName,
        value: toNullOrString(t?.value),
        unit: toNullOrString(t?.unit),
        referenceRange: toNullOrString(t?.referenceRange),
        status: toNullOrString(t?.status)
      };
    })
    .filter(Boolean);
}

function mergeTestEntries(existing, incoming) {
  const map = new Map();
  for (const t of existing) {
    const key = canonicalizeTestName(t?.testName);
    if (!key) continue;
    map.set(key, t);
  }

  for (const t of incoming) {
    const key = canonicalizeTestName(t?.testName);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, t);
      continue;
    }
    const prevHasValue = toNullOrString(prev?.value) != null;
    const nextHasValue = toNullOrString(t?.value) != null;
    if (!prevHasValue && nextHasValue) map.set(key, t);
  }

  return Array.from(map.values());
}

async function extractTestsFromPdfs({ openai, pdfFiles, extractedText, testNames }) {
  const systemPrompt = `You are a medical report extraction engine.

You must strictly extract test data from medical PDF(s).
You must follow the provided test list exactly.
You must not skip any test.
You must not invent data.
You must not explain anything.
You must return JSON only.
You must extract the exact value text from the PDF(s). Do not modify the value.

If a test from the list is not present in the PDF(s), mark:
"value": null
"unit": null
"referenceRange": null
"status": "NOT_PRESENTED"`;

  const userPrompt = `Extract test data from the uploaded medical PDF(s).

You MUST search ONLY for the following tests:

TEST LIST:
${bulletList(testNames)}

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
- If test not present \u2192 NOT_PRESENTED

Return JSON ONLY with this format:
{
  "tests": [
    { "testName": "", "value": "", "unit": "", "referenceRange": "", "status": "" }
  ]
}

Do not add extra keys.
Do not add text.
Return JSON only.`;

  let content = "";
  if (requireString(extractedText)) {
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
    const fileParts = pdfFiles.map((f) => {
      const base64 = f.buffer.toString("base64");
      const fileDataUrl = `data:application/pdf;base64,${base64}`;
      return { type: "input_file", filename: f.originalname || "report.pdf", file_data: fileDataUrl };
    });
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        {
          role: "user",
          content: [...fileParts, { type: "input_text", text: userPrompt }]
        }
      ]
    });
    content = getTextFromResponsesOutput(response);
  }

  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeIncomingTests(parsedJson);
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

gptRouter.post(
  "/heart-urine-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const uploaded = collectUploadedFiles(req);

    const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
    const unsupportedFiles = uploaded.filter((f) => !isPdfMime(f?.mimetype));
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({
        error: "Only PDF files are allowed."
      });
    }
    if (pdfFiles.length === 0) {
      return res.status(400).json({ error: "Upload PDF(s) as field name 'files'." });
    }

    const extractedText = await extractPdfTextForPrompt(pdfFiles);

    const gptConcurrency = parseMaybeNumber(process.env.GPT_CONCURRENCY) ?? 2;

    const heartPromise = extractTestsFromPdfs({
      openai,
      pdfFiles,
      extractedText,
      testNames: HEART_TESTS
    });

    const chunks = chunkArray(PARAMETER_TESTS_FOR_EXTRACTION, 150);
    const chunkResults = await mapWithConcurrency(chunks, gptConcurrency, async (chunk) => {
      return extractTestsFromPdfs({
        openai,
        pdfFiles,
        extractedText,
        testNames: chunk
      });
    });

    const heartIncomingTests = await heartPromise;
    const mergedParameterTests = chunkResults.reduce(
      (acc, incoming) => mergeTestEntries(acc, incoming),
      []
    );

    const heart = buildStrictCategory(HEART_TESTS, { tests: heartIncomingTests });
    const urine = buildStrictCategory(URINE_PARAMETER_TESTS, { tests: mergedParameterTests });
    const blood = buildStrictCategory(BLOOD_PARAMETER_TESTS, { tests: mergedParameterTests });

    res.json({ heart, urine, blood });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

gptRouter.post(
  "/heart-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const uploaded = collectUploadedFiles(req);
    const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
    const unsupportedFiles = uploaded.filter((f) => !isPdfMime(f?.mimetype));
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({
        error: "Only PDF files are allowed."
      });
    }
    if (pdfFiles.length === 0) {
      return res.status(400).json({ error: "Upload PDF(s) as field name 'files'." });
    }

    const extractedText = await extractPdfTextForPrompt(pdfFiles);
    const incoming = await extractTestsFromPdfs({
      openai,
      pdfFiles,
      extractedText,
      testNames: HEART_TESTS
    });

    const heart = buildStrictCategory(HEART_TESTS, { tests: incoming });
    res.json({ heart });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

gptRouter.post(
  "/urine-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const uploaded = collectUploadedFiles(req);
    const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
    const unsupportedFiles = uploaded.filter((f) => !isPdfMime(f?.mimetype));
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({
        error: "Only PDF files are allowed."
      });
    }
    if (pdfFiles.length === 0) {
      return res.status(400).json({ error: "Upload PDF(s) as field name 'files'." });
    }

    const { chunkIndex, chunkSize } = getChunkParams(req);
    const { safeIndex, totalChunks, chunk } = sliceChunk(URINE_PARAMETER_TESTS, chunkIndex, chunkSize);

    const extractedText = await extractPdfTextForPrompt(pdfFiles);
    const incoming = await extractTestsFromPdfs({
      openai,
      pdfFiles,
      extractedText,
      testNames: chunk
    });

    const urine = buildStrictCategory(chunk, { tests: incoming });
    res.json({ urine, chunkIndex: safeIndex, totalChunks, chunkSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

gptRouter.post(
  "/blood-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const uploaded = collectUploadedFiles(req);
    const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
    const unsupportedFiles = uploaded.filter((f) => !isPdfMime(f?.mimetype));
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({
        error: "Only PDF files are allowed."
      });
    }
    if (pdfFiles.length === 0) {
      return res.status(400).json({ error: "Upload PDF(s) as field name 'files'." });
    }

    const { chunkIndex, chunkSize } = getChunkParams(req);
    const { safeIndex, totalChunks, chunk } = sliceChunk(BLOOD_PARAMETER_TESTS, chunkIndex, chunkSize);

    const extractedText = await extractPdfTextForPrompt(pdfFiles);
    const incoming = await extractTestsFromPdfs({
      openai,
      pdfFiles,
      extractedText,
      testNames: chunk
    });

    const blood = buildStrictCategory(chunk, { tests: incoming });
    res.json({ blood, chunkIndex: safeIndex, totalChunks, chunkSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
