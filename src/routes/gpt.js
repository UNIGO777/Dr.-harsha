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

function normalizeAiProvider(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!v) return "openai";
  if (v.includes("claude") || v.includes("anthropic")) return "claude";
  if (v.includes("openai") || v.includes("gpt")) return "openai";
  return "openai";
}

function getAiProviderFromReq(req) {
  return normalizeAiProvider(req?.body?.provider ?? req?.query?.provider);
}

function hasAnthropicKey() {
  return requireString(process.env.ANTHROPIC_API_KEY);
}

function getTextFromAnthropicMessageResponse(response) {
  const content = response?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

function getFetch() {
  if (typeof fetch === "function") return fetch;
  throw new Error("Global fetch is not available. Use Node.js v18+.");
}

async function anthropicCreateJsonMessage({ system, messages, model, temperature, maxTokens }) {
  if (!hasAnthropicKey()) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const finalModel = requireString(model)
    ? model
    : process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const res = await getFetch()("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: finalModel,
      max_tokens: Number.isFinite(maxTokens) ? Math.max(256, Math.trunc(maxTokens)) : 4096,
      temperature: Number.isFinite(temperature) ? temperature : 0,
      system: requireString(system) ? system : undefined,
      messages: Array.isArray(messages) ? messages : []
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (typeof data?.error?.message === "string" && data.error.message.trim()) ||
      (typeof data?.message === "string" && data.message.trim()) ||
      `Anthropic request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
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

function extractFirstJsonObjectText(text) {
  if (!requireString(text)) return null;
  const s = String(text);
  const start = s.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
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

async function extractPdfTextRawForPrompt(pdfFiles) {
  const maxPdfTextChars = 80000;
  let extractedText = "";
  for (const f of Array.isArray(pdfFiles) ? pdfFiles : []) {
    if (extractedText.length >= maxPdfTextChars) break;
    const parsed = await pdfParse(f.buffer);
    const extracted = typeof parsed?.text === "string" ? parsed.text : "";
    const trimmed = extracted.trim();
    if (!trimmed) continue;
    const capped = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
    const next = `\n\n[PDF: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxPdfTextChars);
  }
  return extractedText;
}

async function extractPdfTextForPrompt(pdfFiles) {
  const maxPdfTextChars = 80000;
  let extractedText = "";
  for (const f of pdfFiles) {
    if (extractedText.length >= maxPdfTextChars) break;
    const parsed = await pdfParse(f.buffer);
    const extracted = typeof parsed?.text === "string" ? parsed.text : "";
    const capped = capTextForPromptWithAnchors(extracted, 12000, [
      "Complete Urinogram",
      "Urinogram",
      "Microscopic Examination",
      "Chemical Examination",
      "Urinary Protein",
      "Urinary Glucose"
    ]);
    if (!capped) continue;
    const next = `\n\n[PDF: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxPdfTextChars);
  }
  return extractedText;
}

async function extractPdfTextForBloodPrompt(pdfFiles) {
  const maxPdfTextChars = 240000;
  let extractedText = "";
  for (const f of pdfFiles) {
    if (extractedText.length >= maxPdfTextChars) break;
    const parsed = await pdfParse(f.buffer);
    const extracted = typeof parsed?.text === "string" ? parsed.text : "";
    const trimmed = extracted.trim();
    if (!trimmed) continue;
    const next = `\n\n[PDF: ${f.originalname}]\n${trimmed}`;
    extractedText = (extractedText + next).slice(0, maxPdfTextChars);
  }
  return extractedText;
}

async function extractDocxTextForBloodPrompt(docxFiles) {
  const maxDocxTextChars = 240000;
  let extractedText = "";
  for (const f of docxFiles) {
    if (extractedText.length >= maxDocxTextChars) break;
    const result = await mammoth.extractRawText({ buffer: f.buffer });
    const extracted = typeof result?.value === "string" ? result.value : "";
    const trimmed = extracted.trim();
    if (!trimmed) continue;
    const next = `\n\n[DOCX: ${f.originalname}]\n${trimmed}`;
    extractedText = (extractedText + next).slice(0, maxDocxTextChars);
  }
  return extractedText;
}

async function extractDocxTextForPrompt(docxFiles) {
  const maxDocxTextChars = 80000;
  let extractedText = "";
  for (const f of docxFiles) {
    if (extractedText.length >= maxDocxTextChars) break;
    const result = await mammoth.extractRawText({ buffer: f.buffer });
    const extracted = typeof result?.value === "string" ? result.value : "";
    const capped = capTextForPromptWithAnchors(extracted, 12000, [
      "Complete Urinogram",
      "Urinogram",
      "Microscopic Examination",
      "Chemical Examination",
      "Urinary Protein",
      "Urinary Glucose"
    ]);
    if (!capped) continue;
    const next = `\n\n[DOCX: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxDocxTextChars);
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

function sliceChunkFixed(list, chunkIndex, maxChunks) {
  const items = Array.isArray(list) ? list : [];
  const requested = Number.isFinite(maxChunks) ? Math.max(1, Math.trunc(maxChunks)) : 4;
  const totalChunks = Math.max(1, Math.min(requested, items.length || 1));
  const chunkSize = Math.max(1, Math.ceil(items.length / totalChunks));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);
  const start = safeIndex * chunkSize;
  const end = start + chunkSize;
  return { safeIndex, totalChunks, chunkSize, chunk: items.slice(start, end) };
}

function sliceTextFixed(text, chunkIndex, maxChunks) {
  const s = typeof text === "string" ? text : "";
  const requested = Number.isFinite(maxChunks) ? Math.max(1, Math.trunc(maxChunks)) : 4;
  const totalChunks = Math.max(1, Math.min(requested, s.length || 1));
  const chunkSize = Math.max(1, Math.ceil(s.length / totalChunks));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);
  const start = safeIndex * chunkSize;
  const end = start + chunkSize;
  return { safeIndex, totalChunks, chunkSize, chunkText: s.slice(start, end) };
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
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
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

    if (provider === "claude") {
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
      return;
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

function safeParseJsonObjectLoose(text) {
  const direct = safeParseJsonObject(text);
  if (direct) return direct;
  const extracted = extractFirstJsonObjectText(text);
  if (!extracted) return null;
  return safeParseJsonObject(extracted);
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

const HEART_RELATED_EXTRACT_TESTS = [
  "HS-CRP",
  "Homocysteine",
  "Lipoprotein (a) [Lp(a)]",
  "Apolipoprotein A1",
  "Apolipoprotein B",
  "Apo B / Apo A1 Ratio",
  "Total Cholesterol",
  "HDL Cholesterol",
  "LDL Cholesterol",
  "Triglycerides",
  "VLDL",
  "Non-HDL Cholesterol",
  "TC/HDL Ratio",
  "LDL/HDL Ratio",
  "Triglyceride/HDL Ratio",
  "HDL/LDL Ratio",
  "Fasting Blood Sugar",
  "HbA1c",
  "Average Blood Glucose",
  "Magnesium",
  "eGFR"
];

const BLOOD_ANALYSIS_EXTRACT_TESTS = uniqueTestNames([
  "Homocysteine",
  "Hematocrit (PCV)",
  "RDW-SD",
  "RDW SD",
  "Average Blood Glucose (ABG)",
  "Average Blood Glucose",
  "Fasting Blood Sugar",
  "HbA1c",
  "Testosterone",
  "HDL/LDL Ratio",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Non HDL Cholesterol",
  "Total Cholesterol",
  "Trig/HDL Ratio",
  "Triglyceride/HDL Ratio",
  "Triglycerides",
  "VLDL Cholesterol",
  "VLDL",
  "SGPT (ALT)",
  "SGPT",
  "ALT (SGPT)",
  "Albumin - Serum",
  "Serum Albumin",
  "SGOT (AST)",
  "SGOT",
  "AST (SGOT)",
  "GGT",
  "Alb/Globulin Ratio",
  "Albumin/Globulin Ratio",
  "Serum Globulin",
  "Uric Acid",
  "25-OH Vitamin D",
  "25 OH Vitamin D",
  "Vitamin D (25-OH)",
  "Vitamin B-12",
  "Vitamin B12",
  "Hemoglobin",
  "Total RBC Count",
  "MCV",
  "MCH",
  "MCHC",
  "Total Leucocyte Count (WBC)",
  "Total Leukocyte Count (WBC)",
  "Platelet Count",
  "Cystatin C",
  "eGFR",
  "Serum Creatinine (Urine)",
  "Serum Creatinine",
  "Iron",
  "Ferritin",
  "Fructosamine",
  "Lipoprotein (a)",
  "Lipoprotein (a) [Lp(a)]",
  "Serum Zinc",
  "Amylase",
  "Urine Microalbumin",
  "Urine Glucose",
  "Urine Protein",
  "Urine Specific Gravity",
  "Urine pH"
]);

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

const URINOGRAM_EXTRACT_TESTS = [
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
  "Red Blood Cells",
  "Urinary Leucocytes (Pus Cells)",
  "Epithelial Cells",
  "Casts",
  "Crystals",
  "Bacteria",
  "Yeast",
  "Parasite"
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

function isHeartParameterTestName(name) {
  const u = String(name || "").toUpperCase();
  if (!u) return false;

  const keywords = [
    "CHOLESTEROL",
    "TRIGLYCER",
    "HDL",
    "LDL",
    "VLDL",
    "NON-HDL",
    "NON HDL",
    "APOLIPOPROTEIN",
    "APO-",
    "APO ",
    "LIPOPROTEIN",
    "LP(A)",
    "LP-PLA2",
    "HS-CRP",
    "HS CRP",
    "CRP",
    "HOMOCYSTEINE",
    "TROPONIN",
    "NT-PROBNP",
    "NT PROBNP",
    "BNP",
    "CK-MB",
    "CK MB",
    "CKMB",
    "CREATINE KINASE",
    "D-DIMER",
    "D DIMER"
  ];

  return keywords.some((k) => u.includes(k));
}

const HEART_PARAMETER_TESTS = (() => {
  const list = PARAMETER_TESTS.filter(isHeartParameterTestName);
  return uniqueTestNames(list);
})();

const HEART_ALL_TESTS = uniqueTestNames([...HEART_TESTS, ...HEART_PARAMETER_TESTS]);

const URINE_PARAMETER_TESTS = (() => {
  const list = PARAMETER_TESTS.filter((name) => {
    const u = String(name).toUpperCase();
    return u.includes("URINE") || u.includes("URINARY");
  });
  return uniqueTestNames(list);
})();

function isOtherParameterTestName(name) {
  const u = String(name || "").toUpperCase();
  if (!u) return false;

  const keywords = [
    "STOOL",
    "SPUTUM",
    "SEMEN",
    "SWAB",
    "VAGINAL",
    "CERVICAL",
    "URETHRAL",
    "THROAT",
    "NASAL",
    "SALIVA",
    "CSF",
    "CEREBROSPINAL",
    "SYNOVIAL",
    "PLEURAL",
    "ASCITIC",
    "PERITONEAL",
    "PERICARDIAL",
    "AMNIOTIC",
    "TISSUE",
    "BIOPSY",
    "SMEAR",
    "PAP",
    "KOH",
    "HANGING DROP",
    "MICROSCOPY",
    "CULTURE",
    "PCR",
    "ALCOHOL",
    "OPIATE",
    "OPIATES",
    "CANNAB",
    "TETRAHYDROCANNABINOL",
    "BENZODIAZEP",
    "BARBITUR",
    "METHAMPHET",
    "AMPHET",
    "MDMA",
    "COCAINE",
    "MORPHINE",
    "METHADONE",
    "KETAMINE",
    "PHENCYCLIDINE",
    "NICOTINE"
  ];

  return keywords.some((k) => u.includes(k));
}

const OTHER_PARAMETER_TESTS = (() => {
  const urineCanon = new Set(URINE_PARAMETER_TESTS.map(canonicalizeTestName));
  const heartCanon = new Set(HEART_ALL_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (urineCanon.has(key)) continue;
    if (heartCanon.has(key)) continue;
    if (!isOtherParameterTestName(name)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const BLOOD_PARAMETER_TESTS = (() => {
  const urineCanon = new Set(URINE_PARAMETER_TESTS.map(canonicalizeTestName));
  const heartCanon = new Set(HEART_ALL_TESTS.map(canonicalizeTestName));
  const otherCanon = new Set(OTHER_PARAMETER_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (urineCanon.has(key)) continue;
    if (heartCanon.has(key)) continue;
    if (otherCanon.has(key)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const PARAMETER_TESTS_FOR_EXTRACTION = (() => {
  const heartCanon = new Set(HEART_ALL_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (heartCanon.has(key)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const OTHER_ANALYSIS_EXTRACT_TESTS = (() => {
  const excluded = uniqueTestNames([
    ...(Array.isArray(BLOOD_ANALYSIS_EXTRACT_TESTS) ? BLOOD_ANALYSIS_EXTRACT_TESTS : []),
    ...(Array.isArray(HEART_RELATED_EXTRACT_TESTS) ? HEART_RELATED_EXTRACT_TESTS : []),
    ...(Array.isArray(HEART_TESTS) ? HEART_TESTS : []),
    ...(Array.isArray(URINOGRAM_EXTRACT_TESTS) ? URINOGRAM_EXTRACT_TESTS : []),
    ...(Array.isArray(URINE_TESTS) ? URINE_TESTS : [])
  ]);
  const excludedCanon = new Set(excluded.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (excludedCanon.has(key)) continue;
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

function buildPresentedCategory(list, incoming) {
  const category = buildStrictCategory(list, incoming);
  const tests = (category?.tests ?? []).filter(
    (t) => t?.status !== "NOT_PRESENTED" && t?.status !== "NOT_FOUND"
  );
  return { data: tests.length > 0, tests };
}

function capTextForPrompt(text, maxChars) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  const headChars = Math.floor(maxChars * 0.4);
  const midChars = Math.floor(maxChars * 0.2);
  const tailChars = maxChars - headChars - midChars;

  const head = trimmed.slice(0, headChars);

  const midStart = Math.max(0, Math.floor(trimmed.length / 2 - midChars / 2));
  const middle = trimmed.slice(midStart, midStart + midChars);

  const tail = trimmed.slice(Math.max(0, trimmed.length - tailChars));

  return `${head}\n...\n[MIDDLE]\n${middle}\n...\n[END]\n${tail}`;
}

function capTextForPromptWithAnchors(text, maxChars, anchors) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;

  const list = Array.isArray(anchors) ? anchors.filter(requireString) : [];
  const haystack = trimmed.toUpperCase();
  let matchIndex = -1;
  for (const a of list) {
    const idx = haystack.indexOf(String(a).toUpperCase());
    if (idx >= 0 && (matchIndex === -1 || idx < matchIndex)) matchIndex = idx;
  }

  if (matchIndex === -1) return capTextForPrompt(trimmed, maxChars);

  const headChars = Math.floor(maxChars * 0.25);
  const anchorChars = Math.floor(maxChars * 0.5);
  const tailChars = Math.max(0, maxChars - headChars - anchorChars);

  const head = trimmed.slice(0, headChars);

  const anchorStart = Math.max(0, Math.floor(matchIndex - anchorChars / 2));
  const anchorBlock = trimmed.slice(anchorStart, anchorStart + anchorChars);

  const tail = trimmed.slice(Math.max(0, trimmed.length - tailChars));

  return `${head}\n...\n[FOCUS]\n${anchorBlock}\n...\n[END]\n${tail}`;
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

function normalizeLooseIncomingTests(incoming) {
  const tests = Array.isArray(incoming?.tests) ? incoming.tests : [];
  return tests
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.testName) ?? toNullOrString(t?.test_name) ?? toNullOrString(t?.name);
      if (!testName) return null;
      const value = toNullOrString(t?.value) ?? toNullOrString(t?.observed_value);
      const unit = toNullOrString(t?.unit) ?? toNullOrString(t?.units);
      const referenceRange =
        toNullOrString(t?.referenceRange) ?? toNullOrString(t?.reference_range) ?? toNullOrString(t?.range);
      const status = toNullOrString(t?.status);
      const computed = computeStatus({ value, referenceRange, fallbackStatus: status });
      return { testName, value, unit, referenceRange, status: computed };
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

async function extractTestsFromPdfs({ openai, pdfFiles, extractedText, testNames, provider }) {
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
  const resolvedProvider = normalizeAiProvider(provider);
  const textForPrompt = requireString(extractedText)
    ? extractedText
    : resolvedProvider === "claude"
      ? await extractPdfTextRawForPrompt(pdfFiles)
      : "";

  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeIncomingTests(parsedJson);
  }

  if (requireString(textForPrompt)) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        { role: "user", content: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }
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

async function extractAllBloodParametersFromText({ openai, extractedText, provider }) {
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Extract ALL blood test parameters present in the provided report text.

Only include parameters that are actually present with a value in the text.
Do not include urine/stool tests.

For EACH parameter return:
- testName
- value
- unit
- referenceRange
- status

Status Rules:
- If referenceRange is available and value is numeric, set status to LOW/HIGH/NORMAL.
- Otherwise set status to NORMAL.

Return JSON ONLY with this format:
{
  "tests": [
    { "testName": "", "value": "", "unit": "", "referenceRange": "", "status": "" }
  ]
}`;

  let content = "";
  if (normalizeAiProvider(provider) === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[REPORT_TEXT]\n${extractedText}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        { role: "user", content: `${userPrompt}\n\n[REPORT_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsedJson = (normalizeAiProvider(provider) === "claude" ? safeParseJsonObjectLoose(content) : safeParseJsonObject(content)) ?? {};
  return normalizeLooseIncomingTests(parsedJson);
}

async function extractAllBloodParametersFromImagesAndText({ openai, imageFiles, extractedText, provider }) {
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Extract ALL blood test parameters present in the provided medical report images and text.

Only include parameters that are actually present with a value.
Do not include urine/stool tests.

For EACH parameter return:
- testName
- value
- unit
- referenceRange
- status

Status Rules:
- If referenceRange is available and value is numeric, set status to LOW/HIGH/NORMAL.
- Otherwise set status to NORMAL.

Return JSON ONLY with this format:
{
  "tests": [
    { "testName": "", "value": "", "unit": "", "referenceRange": "", "status": "" }
  ]
}`;

  let content = "";
  if (normalizeAiProvider(provider) === "claude") {
    const parts = [
      { type: "text", text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 12000)}` }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const contentParts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 12000)}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        { role: "user", content: contentParts }
      ]
    });

    content = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsedJson = (normalizeAiProvider(provider) === "claude" ? safeParseJsonObjectLoose(content) : safeParseJsonObject(content)) ?? {};
  return normalizeLooseIncomingTests(parsedJson);
}

async function extractTestsFromImagesAndText({ openai, imageFiles, extractedText, testNames, provider }) {
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Extract test data from the uploaded medical report images.

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
- If value < range → LOW
- If value > range → HIGH
- If within range → NORMAL
- If test not present → NOT_PRESENTED

Return JSON ONLY with this format:
{
  "tests": [
    { "testName": "", "value": "", "unit": "", "referenceRange": "", "status": "" }
  ]
}

Do not add extra keys.
Do not add text.
Return JSON only.`;

  const resolvedProvider = normalizeAiProvider(provider);
  let content = "";

  if (resolvedProvider === "claude") {
    const parts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 10000)}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeIncomingTests(parsedJson);
  }

  const contentParts = [
    { type: "text", text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 10000)}` }
  ];
  const images = Array.isArray(imageFiles) ? imageFiles : [];
  for (const f of images) {
    const b64 = f.buffer.toString("base64");
    const dataUrl = `data:${f.mimetype};base64,${b64}`;
    contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
      { role: "user", content: contentParts }
    ]
  });

  content = completion.choices?.[0]?.message?.content ?? "";
  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeIncomingTests(parsedJson);
}

function normalizeHeartRelatedIncomingTests(parsedJson) {
  const arr = Array.isArray(parsedJson?.heart_related_tests) ? parsedJson.heart_related_tests : [];
  return arr
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.test_name) ?? toNullOrString(t?.testName) ?? toNullOrString(t?.name);
      if (!testName) return null;
      const value = toNullOrString(t?.observed_value) ?? toNullOrString(t?.value);
      const unit = toNullOrString(t?.units) ?? toNullOrString(t?.unit);
      const referenceRange = toNullOrString(t?.reference_range) ?? toNullOrString(t?.referenceRange);
      const status = toNullOrString(t?.status);
      return { testName, value, unit, referenceRange, status };
    })
    .filter(Boolean);
}

async function extractHeartRelatedTestsFromPdfs({ openai, pdfFiles, extractedText, provider }) {
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not return text outside JSON.`;

  const userPrompt = `Extract all heart-related tests from the medical report.

Heart-related tests include:
${bulletList(HEART_RELATED_EXTRACT_TESTS)}

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not return text outside JSON.

JSON format must be:
{
  "heart_related_tests": [
    {
      "test_name": "",
      "observed_value": "",
      "units": "",
      "reference_range": "",
      "status": ""
    }
  ]
}

Status must be one of:
"Normal", "High", "Low", "Very High", "Borderline"

If a test is not found, do not include it.`;

  let content = "";
  const resolvedProvider = normalizeAiProvider(provider);
  const textForPrompt = requireString(extractedText)
    ? extractedText
    : resolvedProvider === "claude"
      ? await extractPdfTextRawForPrompt(pdfFiles)
      : "";

  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeHeartRelatedIncomingTests(parsedJson);
  }

  if (requireString(textForPrompt)) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        { role: "user", content: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }
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
  return normalizeHeartRelatedIncomingTests(parsedJson);
}

function normalizeUrinogramIncomingTests(parsedJson) {
  const arr = Array.isArray(parsedJson?.urine_tests) ? parsedJson.urine_tests : [];
  return arr
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.test_name) ?? toNullOrString(t?.testName) ?? toNullOrString(t?.name);
      if (!testName) return null;
      const methodology = toNullOrString(t?.methodology);
      const value = toNullOrString(t?.observed_value) ?? toNullOrString(t?.value);
      const unit = toNullOrString(t?.units) ?? toNullOrString(t?.unit);
      const referenceRange = toNullOrString(t?.reference_range) ?? toNullOrString(t?.referenceRange);
      const status = toNullOrString(t?.status);
      return { testName, methodology, value, unit, referenceRange, status };
    })
    .filter(Boolean);
}

function toUrinogramKey(name) {
  const base = canonicalizeTestName(name);
  if (!base) return "";
  if (base.startsWith("redbloodcells")) return "redbloodcells";
  return base;
}

function buildCompleteUrinogramTests(incomingTests) {
  const list = Array.isArray(incomingTests) ? incomingTests : [];
  const map = new Map();
  for (const t of list) {
    const key = toUrinogramKey(t?.testName);
    if (!key) continue;
    map.set(key, t);
  }

  return URINOGRAM_EXTRACT_TESTS.map((testName) => {
    const key = toUrinogramKey(testName);
    const entry = map.get(key);
    if (entry) return { ...entry, testName };
    return {
      testName,
      methodology: null,
      value: "Not included in the PDF",
      unit: null,
      referenceRange: null,
      status: "Not included in the PDF"
    };
  });
}

function hasUrinogramMarkers(text) {
  const s = typeof text === "string" ? text.toUpperCase() : "";
  if (!s.trim()) return false;
  if (s.includes("URINOGRAM")) return true;
  if (s.includes("COMPLETE URINOGRAM")) return true;
  if (s.includes("MICROSCOPIC EXAMINATION")) return true;
  if (s.includes("CHEMICAL EXAMINATION")) return true;
  if (s.includes("URINARY PROTEIN")) return true;
  if (s.includes("URINARY GLUCOSE")) return true;
  return false;
}

async function extractUrinogramTestsFromPdfs({ openai, pdfFiles, imageFiles, extractedText, provider }) {
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Extract ALL urinary test parameters from the medical report exactly as shown in the "Complete Urinogram" section.

Include:

Physical Examination:
${bulletList(["Volume", "Colour", "Appearance", "Specific Gravity", "pH"])}

Chemical Examination:
${bulletList([
  "Urinary Protein",
  "Urinary Glucose",
  "Urine Ketone",
  "Urinary Bilirubin",
  "Urobilinogen",
  "Bile Salt",
  "Bile Pigment",
  "Urine Blood",
  "Nitrite",
  "Leucocyte Esterase"
])}

Microscopic Examination:
${bulletList([
  "Mucus",
  "Red Blood Cells",
  "Urinary Leucocytes (Pus Cells)",
  "Epithelial Cells",
  "Casts",
  "Crystals",
  "Bacteria",
  "Yeast",
  "Parasite"
])}

Strict JSON format:
{
  "urine_tests": [
    {
      "test_name": "",
      "methodology": "",
      "observed_value": "",
      "units": "",
      "reference_range": "",
      "status": ""
    }
  ]
}

Rules:
- If value matches reference range \u2192 status = "Normal"
- If value deviates \u2192 status = "Abnormal"
- If reference is text like "Absent" or "Clear", compare accordingly
- Preserve text like "Present 1+(100-250 mg/dl)" exactly
- If a parameter is not found, include it with:
  - observed_value = "Not included in the PDF"
  - methodology = ""
  - units = ""
  - reference_range = ""
  - status = "Not included in the PDF"
- Output must be valid JSON only.`;

  const resolvedProvider = normalizeAiProvider(provider);
  if (resolvedProvider === "claude") {
    const parts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 8000, [
          "Complete Urinogram",
          "Urinogram",
          "Microscopic Examination",
          "Chemical Examination",
          "Urinary Protein",
          "Urinary Glucose"
        ])}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }

    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });

    const content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeUrinogramIncomingTests(parsedJson);
  }

  let content = "";
  const pdfList = Array.isArray(pdfFiles) ? pdfFiles : [];
  const imageList = Array.isArray(imageFiles) ? imageFiles : [];
  const extractedHasMarkers = hasUrinogramMarkers(extractedText);

  if (requireString(extractedText) && extractedHasMarkers && imageList.length === 0) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        { role: "user", content: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
    const parsedJson = safeParseJsonObject(content) ?? {};
    const normalized = normalizeUrinogramIncomingTests(parsedJson);
    if (normalized.length >= Math.min(URINOGRAM_EXTRACT_TESTS.length, 10)) return normalized;
  }

  const shouldUseTextOnly = requireString(extractedText) && pdfList.length === 0 && imageList.length === 0;

  if (shouldUseTextOnly) {
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
  } else if (imageList.length > 0 && pdfList.length === 0) {
    const contentParts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 6000, [
          "Complete Urinogram",
          "Urinogram",
          "Microscopic Examination",
          "Chemical Examination",
          "Urinary Protein",
          "Urinary Glucose"
        ])}`
      }
    ];
    for (const f of imageList) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        { role: "user", content: contentParts }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  } else {
    const fileParts = pdfList.map((f) => {
      const base64 = f.buffer.toString("base64");
      const fileDataUrl = `data:application/pdf;base64,${base64}`;
      return { type: "input_file", filename: f.originalname || "report.pdf", file_data: fileDataUrl };
    });
    const extraText = requireString(extractedText)
      ? `\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 6000, [
          "Complete Urinogram",
          "Urinogram",
          "Microscopic Examination",
          "Chemical Examination",
          "Urinary Protein",
          "Urinary Glucose"
        ])}`
      : "";
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
        {
          role: "user",
          content: [...fileParts, { type: "input_text", text: `${userPrompt}${extraText}` }]
        }
      ]
    });
    content = getTextFromResponsesOutput(response);
  }

  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeUrinogramIncomingTests(parsedJson);
}

gptRouter.post("/advanced-body-composition", upload.single("file"), async (req, res) => {
  try {
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
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

    if (extractedText && provider === "claude") {
      const response = await anthropicCreateJsonMessage({
        system: "You extract structured data from a Body Composition Analysis Report in JSON.",
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
      return;
    }

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

    if (provider === "claude") {
      return res.status(400).json({
        error: "Could not extract readable text from this PDF for Claude. Use GPT or upload a text-based PDF."
      });
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
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
    }

    const uploaded = collectUploadedFiles(req);

    const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
    const docxFiles = uploaded.filter((f) => isDocxMime(f?.mimetype));
    const imageFiles = uploaded.filter((f) => isImageMime(f?.mimetype));
    const unsupportedFiles = uploaded.filter(
      (f) => !isPdfMime(f?.mimetype) && !isDocxMime(f?.mimetype) && !isImageMime(f?.mimetype)
    );
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({
        error: "Only PDF, DOCX, and image files are allowed."
      });
    }
    if (pdfFiles.length + docxFiles.length + imageFiles.length === 0) {
      return res.status(400).json({ error: "Upload file(s) as field name 'files'." });
    }

    const pdfText =
      provider === "claude"
        ? await extractPdfTextRawForPrompt(pdfFiles)
        : await extractPdfTextForPrompt(pdfFiles);
    const docxText = await extractDocxTextForPrompt(docxFiles);
    const extractedText = `${pdfText}${docxText}`;

    const gptConcurrency = parseMaybeNumber(process.env.GPT_CONCURRENCY) ?? 2;

    const heartPromise = extractHeartRelatedTestsFromPdfs({
      openai,
      pdfFiles,
      extractedText,
      provider
    });

    const urinePromise = extractUrinogramTestsFromPdfs({
      openai,
      pdfFiles,
      imageFiles,
      extractedText,
      provider
    });

    const chunks = chunkArray(PARAMETER_TESTS_FOR_EXTRACTION, 150);
    const chunkResults = await mapWithConcurrency(chunks, gptConcurrency, async (chunk) => {
      return extractTestsFromPdfs({
        openai,
        pdfFiles,
        extractedText,
        testNames: chunk,
        provider
      });
    });

    const heartIncomingTests = await heartPromise;
    const urineIncomingTests = await urinePromise;
    const mergedParameterTests = chunkResults.reduce(
      (acc, incoming) => mergeTestEntries(acc, incoming),
      []
    );

    const heartTests = Array.isArray(heartIncomingTests) ? heartIncomingTests : [];
    const heart = { data: heartTests.length > 0, tests: heartTests };
    const urineTests = buildCompleteUrinogramTests(urineIncomingTests);
    const urineHasAny = urineTests.some((t) => t?.status !== "Not included in the PDF");
    const urine = { data: urineHasAny, tests: urineTests };
    const blood = buildPresentedCategory(BLOOD_PARAMETER_TESTS, { tests: mergedParameterTests });
    const other = buildPresentedCategory(OTHER_PARAMETER_TESTS, { tests: mergedParameterTests });

    res.json({ heart, urine, blood, other });
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
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
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
    const incoming = await extractHeartRelatedTestsFromPdfs({
      openai,
      pdfFiles,
      extractedText,
      provider
    });

    const heartTests = Array.isArray(incoming) ? incoming : [];
    const heart = { data: heartTests.length > 0, tests: heartTests };
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
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
    }

    const uploaded = collectUploadedFiles(req);
    const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
    const docxFiles = uploaded.filter((f) => isDocxMime(f?.mimetype));
    const imageFiles = uploaded.filter((f) => isImageMime(f?.mimetype));
    const unsupportedFiles = uploaded.filter(
      (f) => !isPdfMime(f?.mimetype) && !isDocxMime(f?.mimetype) && !isImageMime(f?.mimetype)
    );
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({
        error: "Only PDF, DOCX, and image files are allowed."
      });
    }
    if (pdfFiles.length + docxFiles.length + imageFiles.length === 0) {
      return res.status(400).json({ error: "Upload file(s) as field name 'files'." });
    }

    const pdfText = await extractPdfTextForPrompt(pdfFiles);
    const docxText = await extractDocxTextForPrompt(docxFiles);
    const extractedText = `${pdfText}${docxText}`;
    const incoming = await extractUrinogramTestsFromPdfs({
      openai,
      pdfFiles,
      imageFiles,
      extractedText,
      provider
    });

    const tests = buildCompleteUrinogramTests(incoming);
    const hasAny = tests.some((t) => t?.status !== "Not included in the PDF");
    const urine = { data: hasAny, tests };
    res.json({ urine, chunkIndex: 0, totalChunks: 1, chunkSize: tests.length });
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
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
    }

    const uploaded = collectUploadedFiles(req);
    const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
    const docxFiles = uploaded.filter((f) => isDocxMime(f?.mimetype));
    const imageFiles = uploaded.filter((f) => isImageMime(f?.mimetype));
    const unsupportedFiles = uploaded.filter(
      (f) => !isPdfMime(f?.mimetype) && !isDocxMime(f?.mimetype) && !isImageMime(f?.mimetype)
    );
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({
        error: "Only PDF, DOCX, and image files are allowed."
      });
    }
    if (pdfFiles.length + docxFiles.length + imageFiles.length === 0) {
      return res.status(400).json({ error: "Upload file(s) as field name 'files'." });
    }

    const { chunkIndex } = getChunkParams(req);

    const pdfText = await extractPdfTextForBloodPrompt(pdfFiles);
    const docxText = await extractDocxTextForBloodPrompt(docxFiles);
    const extractedText = `${pdfText}${docxText}`;

    if (!requireString(extractedText)) {
      const blood = { data: false, tests: [] };
      return res.json({ blood, chunkIndex: 0, totalChunks: 1, chunkSize: 1, hasMore: false });
    }

    const { safeIndex, totalChunks, chunkText, chunkSize } = sliceTextFixed(extractedText, chunkIndex, 4);

    const incoming =
      imageFiles.length > 0
        ? await extractAllBloodParametersFromImagesAndText({
          openai,
          imageFiles,
          extractedText: chunkText,
          provider
        })
        : await extractAllBloodParametersFromText({ openai, extractedText: chunkText, provider });

    const merged = mergeTestEntries([], Array.isArray(incoming) ? incoming : []);
    const hasAny = merged.length > 0;
    const blood = { data: hasAny, tests: merged };
    res.json({ blood, chunkIndex: safeIndex, totalChunks, chunkSize, hasMore: safeIndex + 1 < totalChunks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

gptRouter.post(
  "/other-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
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

    const { chunkIndex } = getChunkParams(req);
    const { safeIndex, totalChunks, chunkSize, chunk } = sliceChunkFixed(
      OTHER_ANALYSIS_EXTRACT_TESTS,
      chunkIndex,
      4
    );

    const extractedText = await extractPdfTextForPrompt(pdfFiles);
    const incoming = await extractTestsFromPdfs({
      openai,
      pdfFiles,
      extractedText,
      testNames: chunk,
      provider
    });

    const strict = buildStrictCategory(chunk, { tests: incoming });
    const notIncludedText = "NOT INCLUDED ";
    const tests = (Array.isArray(strict?.tests) ? strict.tests : []).map((t) => {
      const status = String(t?.status || "").toUpperCase();
      const missing = status === "NOT_PRESENTED" || status === "NOT_FOUND";
      if (!missing) return t;
      return {
        ...t,
        value: notIncludedText,
        unit: null,
        referenceRange: null,
        status: notIncludedText
      };
    });

    const other = { data: strict?.data === true, tests };
    res.json({ other, chunkIndex: safeIndex, totalChunks, chunkSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
