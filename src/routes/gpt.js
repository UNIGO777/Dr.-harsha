import express from "express";
import multer from "multer";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAdvancedBodyCompositionHandler } from "../Controllers/AdvancedBodyCompositionController.js";
import { createBloodAnalysisHandler, createOtherAnalysisHandler } from "../Controllers/BloodOtherController.js";
import {
  createDocsTestsCleanHandler,
  createDocsTestsExcelHandler,
  createDocsTestsHandler
} from "../Controllers/DocsTestsController.js";
import { createGptChatHandler } from "../Controllers/GptChatController.js";
import {
  createHeartAnalysisHandler,
  createHeartUrineAnalysisHandler,
  createUrineAnalysisHandler
} from "../Controllers/HeartUrineController.js";

import { AI_OUTPUT_JSON_SUFFIX } from "../AiPrompts/shared.js";
import {
  JSON_REPAIR_SYSTEM_PROMPT,
  buildJsonRepairArrayUserPrompt,
  buildJsonRepairObjectUserPrompt
} from "../AiPrompts/jsonRepairPrompts.js";
import {
  DOCS_TESTS_CLEAN_SCHEMA_HINT,
  DOCS_TESTS_CLEAN_SYSTEM_PROMPT,
  buildDocsTestsCleanUserPrompt
} from "../AiPrompts/docsTestsCleanPrompts.js";
import { MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT } from "../AiPrompts/medicalReportExtractionPrompts.js";
import {
  BLOOD_IMAGES_USER_PROMPT,
  BLOOD_SCHEMA_HINT,
  BLOOD_TEXT_FALLBACK_CLAUDE_USER_PROMPT,
  BLOOD_TEXT_USER_PROMPT
} from "../AiPrompts/bloodPrompts.js";
import {
  DOCS_TESTS_IMAGES_USER_PROMPT,
  DOCS_TESTS_SCHEMA_HINT,
  DOCS_TESTS_TEXT_USER_PROMPT
} from "../AiPrompts/docsTestsPrompts.js";
import { HEART_RELATED_TESTS_SYSTEM_PROMPT, buildHeartRelatedTestsUserPrompt } from "../AiPrompts/heartPrompts.js";
import { TESTS_FROM_PDFS_SYSTEM_PROMPT, buildTestsFromPdfsUserPrompt } from "../AiPrompts/testsFromPdfsPrompts.js";
import { buildTestsFromImagesUserPrompt } from "../AiPrompts/testsFromImagesPrompts.js";
import { URINOGRAM_ANCHOR_TERMS, buildUrinogramUserPrompt } from "../AiPrompts/urinePrompts.js";

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

function sliceTextFixedWithOverlap(text, chunkIndex, maxChunks, overlapChars) {
  const s = typeof text === "string" ? text : "";
  const requested = Number.isFinite(maxChunks) ? Math.max(1, Math.trunc(maxChunks)) : 4;
  const totalChunks = Math.max(1, Math.min(requested, s.length || 1));
  const chunkSize = Math.max(1, Math.ceil(s.length / totalChunks));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);

  const overlap = Number.isFinite(overlapChars) ? Math.max(0, Math.trunc(overlapChars)) : 0;
  const baseStart = safeIndex * chunkSize;
  const baseEnd = baseStart + chunkSize;
  const start = Math.max(0, baseStart - (safeIndex > 0 ? overlap : 0));
  const end = Math.min(s.length, baseEnd + (safeIndex < totalChunks - 1 ? overlap : 0));

  return {
    safeIndex,
    totalChunks,
    chunkSize,
    chunkText: s.slice(start, end)
  };
}

function splitTextWindows(text, windowChars, overlapChars, maxWindows) {
  const s = typeof text === "string" ? text : "";
  const trimmed = s.trim();
  if (!trimmed) return [];
  const size = Number.isFinite(windowChars) ? Math.max(4000, Math.trunc(windowChars)) : 12000;
  const overlap = Number.isFinite(overlapChars) ? Math.max(0, Math.trunc(overlapChars)) : 600;
  const cap = Number.isFinite(maxWindows) ? Math.max(1, Math.trunc(maxWindows)) : 8;
  const step = Math.max(1, size - overlap);

  const windows = [];
  for (let start = 0; start < s.length && windows.length < cap; start += step) {
    const end = Math.min(s.length, start + size);
    const chunk = s.slice(start, end);
    if (chunk.trim()) windows.push(chunk);
    if (end >= s.length) break;
  }
  return windows;
}

function heuristicExtractDocsTestsFromText(extractedText) {
  const text = typeof extractedText === "string" ? extractedText : "";
  if (!text.trim()) return [];

  const addressKeywordRegex =
    /\b(floor|flr|block|layout|phase|road|rd\.?|street|st\.?|sector|nagar|nag\.?|jp\s*nagar|bangalore|bengaluru|karnataka|india|pincode|pin\s*code|zip|district|state)\b/i;

  const looksLikeAddressLine = (line) => {
    const l = String(line ?? "").trim();
    if (!l) return false;
    const hasAddressKeyword = addressKeywordRegex.test(l);
    const hasPinLike = /\b[0-9]{5,6}\b/.test(l);
    const commaCount = (l.match(/,/g) || []).length;
    if (hasAddressKeyword && (commaCount >= 1 || hasPinLike)) return true;
    if (hasPinLike && commaCount >= 2) return true;
    return false;
  };

  const normalizedText = text
    .replace(/([A-Za-zµμ/%])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-zµμ/%])/g, "$1 $2")
    .replace(/[ \t]+/g, " ");

  const looksLikeRange = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (!/[0-9]/.test(v)) return false;
    return /(\bto\b|[-–—]|<|>)/i.test(v);
  };

  const looksLikeUnit = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (looksLikeRange(v)) return false;
    if (v.length > 25) return false;
    return /[a-z%/]/i.test(v);
  };

  const looksLikeValue = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (/[0-9]/.test(v)) return true;
    return /\b(absent|present|nil|negative|positive|trace|reactive|non\s*reactive)\b/i.test(v);
  };

  const looksLikeNumericValue = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (!/[0-9]/.test(v)) return false;
    return /^[<>]?[0-9]+([.,][0-9]+)?$/.test(v) || /^[0-9]+([.,][0-9]+)?%$/.test(v);
  };

  const isTechToken = (s) => {
    const v = String(s ?? "").trim().toUpperCase();
    if (!v) return false;
    return (
      v === "PHOTOMETRY" ||
      v === "CALCULATED" ||
      v === "CALC" ||
      v === "C.M.I." ||
      v === "CMI" ||
      v === "ECLIA" ||
      v === "ELISA" ||
      v === "CLIA" ||
      v === "HPLC" ||
      v === "ASSAY" ||
      v === "METHOD" ||
      v === "TECHNOLOGY"
    );
  };

  const ignoreLine = (line) => {
    const l = String(line ?? "").trim();
    if (!l) return true;
    if (l.length < 3 || l.length > 240) return true;
    if (looksLikeAddressLine(l)) return true;
    const lower = l.toLowerCase();
    if (lower.startsWith("page ")) return true;
    if (lower.includes("reference range") && lower.length < 50) return true;
    if (lower.includes("method") && lower.includes("unit") && lower.includes("result")) return true;
    if (lower.includes("patient") && lower.includes("name")) return true;
    if (lower.includes("collected") && lower.includes("reported")) return true;
    return false;
  };

  const lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !ignoreLine(l));

  const out = [];
  const seen = new Set();
  for (const line of lines) {
    if (looksLikeAddressLine(line)) continue;

    const hasColon = line.includes(":") && !line.includes("http");
    if (hasColon) {
      const idx = line.indexOf(":");
      const name = line.slice(0, idx).trim();
      const tail = line.slice(idx + 1).trim();
      if (name && looksLikeValue(tail) && !looksLikeAddressLine(name) && !looksLikeAddressLine(tail)) {
        const key = `${name.toLowerCase()}|${tail.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
          testName: name,
          value: tail,
          results: [{ value: tail, dateAndTime: null }],
          unit: null,
          referenceRange: null,
          status: computeStatus({ value: tail, referenceRange: null, fallbackStatus: null }),
          section: null,
          page: null,
          remarks: null
          });
        }
        continue;
      }
    }

    const tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) continue;
    const numericIndex = tokens.findIndex((t) => looksLikeNumericValue(t));
    if (numericIndex === -1) continue;
    const value = tokens[numericIndex];
    if (!looksLikeValue(value)) continue;

    const tokenBefore = numericIndex > 0 ? tokens[numericIndex - 1] : null;
    const tokenAfter = numericIndex + 1 < tokens.length ? tokens[numericIndex + 1] : null;

    let unit = null;
    if (tokenBefore && looksLikeUnit(tokenBefore) && !isTechToken(tokenBefore)) unit = tokenBefore;
    if (!unit && tokenAfter && looksLikeUnit(tokenAfter) && !isTechToken(tokenAfter)) unit = tokenAfter;

    let nameTokens = [];
    if (numericIndex + 1 < tokens.length) {
      let start = numericIndex + 1;
      if (unit && tokens[start] === unit) start += 1;
      if (tokens[start] === "%") start += 1;
      nameTokens = tokens.slice(start);
    }

    if (nameTokens.length === 0 && numericIndex > 0) {
      nameTokens = tokens.slice(0, numericIndex);
      if (unit && nameTokens.length > 0 && nameTokens[nameTokens.length - 1] === unit) {
        nameTokens = nameTokens.slice(0, -1);
      }
    }

    while (nameTokens.length > 0 && isTechToken(nameTokens[0])) nameTokens.shift();
    const testName = nameTokens.join(" ").trim();
    if (!requireString(testName) || !/[a-z]/i.test(testName)) continue;
    if (looksLikeAddressLine(testName)) continue;

    let referenceRange = null;
    const rangeCandidates = tokens.filter((t) => looksLikeRange(t));
    if (rangeCandidates.length > 0) referenceRange = rangeCandidates[0];
    if (!unit && !referenceRange && looksLikeAddressLine(line)) continue;

    const key = `${testName.toLowerCase()}|${String(value).toLowerCase()}|${String(unit ?? "").toLowerCase()}|${String(referenceRange ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      testName,
      value,
      results: [{ value, dateAndTime: null }],
      unit,
      referenceRange,
      status: computeStatus({ value, referenceRange, fallbackStatus: null }),
      section: null,
      page: null,
      remarks: null
    });
  }

  return out;
}

function estimateTotalTestsInReportText(extractedText) {
  const text = typeof extractedText === "string" ? extractedText : "";
  if (!text.trim()) return null;
  const extracted = heuristicExtractDocsTestsFromText(text);
  const count = Array.isArray(extracted) ? extracted.length : 0;
  if (!Number.isFinite(count) || count <= 0) return null;
  return Math.min(5000, Math.trunc(count));
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

gptRouter.post(
  "/gpt",
  upload.array("files", MAX_ANALYSIS_FILES),
  createGptChatHandler(getGptControllerContext)
);

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

function extractFirstJsonArrayText(text) {
  if (!requireString(text)) return null;
  const s = String(text);
  const start = s.indexOf("[");
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
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function safeParseJsonArray(text) {
  if (!requireString(text)) return null;
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function safeParseJsonArrayLoose(text) {
  const direct = safeParseJsonArray(text);
  if (direct) return direct;
  const extracted = extractFirstJsonArrayText(text);
  if (!extracted) return null;
  return safeParseJsonArray(extracted);
}

async function repairJsonObjectWithClaude({ rawText, schemaHint, model }) {
  const cleaned = requireString(rawText) ? rawText : "";
  const system = JSON_REPAIR_SYSTEM_PROMPT;
  const user = buildJsonRepairObjectUserPrompt({ schemaHint, rawText: cleaned });

  const response = await anthropicCreateJsonMessage({
    system,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    model: requireString(model) ? model : process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    temperature: 0,
    maxTokens: 2048
  });

  const content = getTextFromAnthropicMessageResponse(response);
  return safeParseJsonObjectLoose(content);
}

async function repairJsonArrayWithClaude({ rawText, schemaHint, model }) {
  const cleaned = requireString(rawText) ? rawText : "";
  const system = JSON_REPAIR_SYSTEM_PROMPT;
  const user = buildJsonRepairArrayUserPrompt({ schemaHint, rawText: cleaned });

  const response = await anthropicCreateJsonMessage({
    system,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    model: requireString(model) ? model : process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    temperature: 0,
    maxTokens: 2048
  });

  const content = getTextFromAnthropicMessageResponse(response);
  return safeParseJsonArrayLoose(content);
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

function canonicalizeDocsTestsMergeKey(name) {
  const base = canonicalizeTestName(name);
  if (!base) return "";
  const stripped = base.replace(
    /(icpms|icp|ms|hplc|elisa|clia|eclia|photometry|colorimetry|turbidimetry|technology|method|calculated)/g,
    ""
  );
  return stripped || base;
}

function stripDocsTestsMethodSuffix(name) {
  if (!requireString(name)) return null;
  const raw = String(name).trim();
  if (!raw) return null;
  const withoutAngles = raw.replace(/[<>]+/g, " ").trim();
  const cut = withoutAngles.replace(
    /\b(icp\s*-?\s*ms|hplc|elisa|clia|eclia|photometry|colorimetry|turbidimetry|technology|method)\b.*$/i,
    ""
  );
  const cleaned = String(cut || withoutAngles).trim();
  return cleaned || raw;
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

const PARAMETER_TESTS_CANON = new Set(PARAMETER_TESTS.map(canonicalizeTestName));
const PARAMETER_TESTS_PREFERRED = (() => {
  const map = new Map();
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || String(name).length < String(prev).length) map.set(key, name);
  }
  return map;
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

const ALLOWED_STATUSES = new Set([
  "LOW",
  "HIGH",
  "NORMAL",
  "ABSENT",
  "PRESENT",
  "NOT_PRESENTED",
  "NOT_FOUND"
]);

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

async function buildDocsTestsExcelBuffer(tests) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "dr-harsha";
  workbook.created = new Date();

  const columns = [
    { header: "Test Name", key: "testName", width: 32 },
    { header: "Value", key: "value", width: 18 },
    { header: "Unit", key: "unit", width: 12 },
    { header: "Reference Range", key: "referenceRange", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Section", key: "section", width: 22 },
    { header: "Page", key: "page", width: 8 },
    { header: "Remarks", key: "remarks", width: 28 }
  ];

  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  const headerFont = { color: { argb: "FFFFFFFF" }, bold: true };

  const sheetFill = {
    normal: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } },
    high: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } },
    low: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } }
  };

  const normalize = (t) => ({
    testName: toNullOrString(t?.testName) ?? "",
    value: toNullOrString(t?.value),
    unit: toNullOrString(t?.unit),
    referenceRange: toNullOrString(t?.referenceRange),
    status: computeStatus({
      value: toNullOrString(t?.value),
      referenceRange: toNullOrString(t?.referenceRange),
      fallbackStatus: t?.status
    }),
    section: toNullOrString(t?.section),
    page: typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null,
    remarks: toNullOrString(t?.remarks)
  });

  const safeTests = (Array.isArray(tests) ? tests.map(normalize) : []).filter((t) => t.value != null);

  const normal = safeTests.filter((t) => {
    const s = String(t.status).toUpperCase();
    return s === "NORMAL" || s === "ABSENT" || s === "PRESENT";
  });
  const high = safeTests.filter((t) => String(t.status).toUpperCase() === "HIGH");
  const low = safeTests.filter((t) => String(t.status).toUpperCase() === "LOW");

  const addSheet = (name, rows, fill) => {
    const ws = workbook.addWorksheet(name);
    ws.columns = columns;
    ws.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length }
    };
    for (const r of rows) {
      const row = ws.addRow({
        testName: r.testName,
        value: r.value,
        unit: r.unit,
        referenceRange: r.referenceRange,
        status: r.status,
        section: r.section,
        page: r.page,
        remarks: r.remarks
      });
      row.eachCell((cell) => {
        cell.fill = fill;
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      });
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  addSheet("Normal", normal, sheetFill.normal);
  addSheet("High", high, sheetFill.high);
  addSheet("Low", low, sheetFill.low);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
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

function normalizeDocsTestsIncoming(incoming) {
  const pickArray = (value) => (Array.isArray(value) ? value : []);
  const candidates = [
    ...pickArray(incoming?.tests),
    ...pickArray(incoming?.parameters),
    ...pickArray(incoming?.items),
    ...pickArray(incoming?.results),
    ...pickArray(incoming?.rows),
    ...pickArray(incoming?.data)
  ];

  const tests = Array.isArray(incoming) ? incoming : candidates;

  return pickArray(tests)
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.testName) ??
        toNullOrString(t?.test_name) ??
        toNullOrString(t?.name) ??
        toNullOrString(t?.parameterName) ??
        toNullOrString(t?.parameter) ??
        toNullOrString(t?.analyte) ??
        toNullOrString(t?.test) ??
        toNullOrString(t?.itemName);
      if (!testName) return null;
      const value = toNullOrString(t?.value) ?? toNullOrString(t?.observed_value);
      const unit = toNullOrString(t?.unit) ?? toNullOrString(t?.units);
      const referenceRange =
        toNullOrString(t?.referenceRange) ?? toNullOrString(t?.reference_range) ?? toNullOrString(t?.range);
      return { testName, value, unit, referenceRange };
    })
    .filter(Boolean);
}

function normalizeLooseIncomingTests(incoming) {
  const pickArray = (value) => (Array.isArray(value) ? value : []);

  const direct = [
    ...pickArray(incoming?.tests),
    ...pickArray(incoming?.blood_tests),
    ...pickArray(incoming?.parameters),
    ...pickArray(incoming?.items),
    ...pickArray(incoming?.results),
    ...pickArray(incoming?.rows),
    ...pickArray(incoming?.data),
    ...pickArray(incoming?.blood?.tests),
    ...pickArray(incoming?.blood?.parameters),
    ...pickArray(incoming?.result?.tests),
    ...pickArray(incoming?.result?.parameters)
  ];

  const fromExcel = [];
  const excelSheets = incoming?.excelSheets ?? incoming?.sheets ?? incoming?.excel ?? null;
  if (excelSheets && typeof excelSheets === "object" && !Array.isArray(excelSheets)) {
    const entries = Object.entries(excelSheets);
    for (const [k, v] of entries) {
      const key = String(k || "").toLowerCase();
      if (key.includes("normal") || key.includes("abnormal") || key.includes("notpresent")) {
        fromExcel.push(...pickArray(v));
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [kk, vv] of Object.entries(v)) {
          const subKey = String(kk || "").toLowerCase();
          if (subKey.includes("normal") || subKey.includes("abnormal") || subKey.includes("notpresent")) {
            fromExcel.push(...pickArray(vv));
          }
        }
      }
    }
  }

  const fromNested = [];
  if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
    for (const v of Object.values(incoming)) {
      if (!Array.isArray(v)) continue;
      const arr = v;
      if (arr.length === 0) continue;
      const looksLikeTests = arr.some((x) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return false;
        return (
          requireString(x?.testName) ||
          requireString(x?.test_name) ||
          requireString(x?.name) ||
          requireString(x?.parameter) ||
          requireString(x?.parameterName) ||
          requireString(x?.analyte) ||
          requireString(x?.test)
        );
      });
      if (looksLikeTests) fromNested.push(...arr);
    }
  }

  const tests = direct.length > 0 ? direct : fromExcel.length > 0 ? fromExcel : fromNested;
  return pickArray(tests)
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.testName) ??
        toNullOrString(t?.test_name) ??
        toNullOrString(t?.name) ??
        toNullOrString(t?.parameterName) ??
        toNullOrString(t?.parameter) ??
        toNullOrString(t?.analyte) ??
        toNullOrString(t?.test) ??
        toNullOrString(t?.itemName);
      if (!testName) return null;
      const normalizeDateTime = (v) => {
        const s = typeof v === "string" ? v : v == null ? "" : String(v);
        const trimmed = s.trim();
        return trimmed ? trimmed : null;
      };

      const normalizeResults = (value) => {
        const list = pickArray(value);
        return list
          .map((r) => {
            if (r == null) return null;
            if (typeof r === "string" || typeof r === "number") {
              const v = toNullOrString(r);
              if (!v) return null;
              return { value: v, dateAndTime: null };
            }
            if (typeof r !== "object" || Array.isArray(r)) return null;
            const v =
              toNullOrString(r?.value) ??
              toNullOrString(r?.observed_value) ??
              toNullOrString(r?.result) ??
              toNullOrString(r?.reading);
            if (!v) return null;
            const dateAndTime =
              normalizeDateTime(r?.dateAndTime) ??
              normalizeDateTime(r?.date_time) ??
              normalizeDateTime(r?.datetime) ??
              normalizeDateTime(r?.date) ??
              normalizeDateTime(r?.time) ??
              null;
            return { value: v, dateAndTime };
          })
          .filter(Boolean);
      };

      const results = normalizeResults(t?.results ?? t?.Results ?? t?.observations ?? t?.values);
      const value =
        toNullOrString(t?.value) ??
        toNullOrString(t?.observed_value) ??
        (results.length > 0 ? toNullOrString(results[results.length - 1]?.value) : null);
      const unit = toNullOrString(t?.unit) ?? toNullOrString(t?.units);
      const referenceRange =
        toNullOrString(t?.referenceRange) ?? toNullOrString(t?.reference_range) ?? toNullOrString(t?.range);
      const status = toNullOrString(t?.status);
      const computed = computeStatus({ value, referenceRange, fallbackStatus: status });
      const section = toNullOrString(t?.section);
      const page = typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null;
      const remarks = toNullOrString(t?.remarks);
      return { testName, value, results, unit, referenceRange, status: computed, section, page, remarks };
    })
    .filter(Boolean);
}

function normalizeCategorizedDocsTestsIncoming(incoming) {
  const pickArray = (value) => (Array.isArray(value) ? value : []);
  const candidates = [
    ...pickArray(incoming?.tests),
    ...pickArray(incoming?.categories),
    ...pickArray(incoming?.groups),
    ...pickArray(incoming?.sections),
    ...pickArray(incoming?.data)
  ];
  const list = Array.isArray(incoming) ? incoming : candidates;
  const looksGrouped = pickArray(list).some((g) => {
    if (!g || typeof g !== "object" || Array.isArray(g)) return false;
    const hasTestsArray =
      Array.isArray(g?.tests) ||
      Array.isArray(g?.Tests) ||
      Array.isArray(g?.items) ||
      Array.isArray(g?.parameters) ||
      Array.isArray(g?.rows);
    const hasName =
      requireString(g?.categoryName) ||
      requireString(g?.CategaryName) ||
      requireString(g?.CategoryName) ||
      requireString(g?.name) ||
      requireString(g?.section);
    return hasTestsArray && hasName;
  });

  if (looksGrouped) {
    return pickArray(list)
      .map((g) => {
        if (!g || typeof g !== "object" || Array.isArray(g)) return null;
        const categoryNameRaw =
          toNullOrString(g?.categoryName) ??
          toNullOrString(g?.CategaryName) ??
          toNullOrString(g?.CategoryName) ??
          toNullOrString(g?.name) ??
          toNullOrString(g?.section) ??
          "Other Tests";
        const categoryName = String(categoryNameRaw).trim() || "Other Tests";
        const testsIncoming =
          Array.isArray(g?.tests)
            ? g.tests
            : Array.isArray(g?.Tests)
              ? g.Tests
              : Array.isArray(g?.items)
                ? g.items
                : Array.isArray(g?.parameters)
                  ? g.parameters
                  : Array.isArray(g?.rows)
                    ? g.rows
                    : [];
        const tests = normalizeLooseIncomingTests({ tests: testsIncoming });
        if (tests.length === 0) return null;
        return { categoryName, tests };
      })
      .filter(Boolean);
  }

  const flat = normalizeLooseIncomingTests(
    Array.isArray(incoming) ? { tests: incoming } : incoming ?? {}
  );
  if (flat.length === 0) return [];

  const map = new Map();
  for (const t of flat) {
    const nameRaw = toNullOrString(t?.section) ?? "Other Tests";
    const categoryName = String(nameRaw).trim() || "Other Tests";
    const prev = map.get(categoryName) ?? [];
    prev.push(t);
    map.set(categoryName, prev);
  }

  return Array.from(map.entries()).map(([categoryName, tests]) => ({
    categoryName,
    tests
  }));
}

function mergeTestEntries(existing, incoming) {
  const normalizeDateKey = (v) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    return s ? s.toLowerCase() : "";
  };
  const mergeResults = (a, b) => {
    const out = [];
    const seen = new Set();
    const push = (r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return;
      const value = toNullOrString(r?.value);
      if (!value) return;
      const dateAndTime = toNullOrString(r?.dateAndTime);
      const key = `${normalizeDateKey(dateAndTime)}|${String(value).trim().toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ value, dateAndTime: dateAndTime ? String(dateAndTime).trim() : null });
    };
    for (const r of Array.isArray(a) ? a : []) push(r);
    for (const r of Array.isArray(b) ? b : []) push(r);
    return out;
  };

  const map = new Map();
  for (const t of existing) {
    const key = canonicalizeDocsTestsMergeKey(t?.testName);
    if (!key) continue;
    map.set(key, t);
  }

  for (const t of incoming) {
    const key = canonicalizeDocsTestsMergeKey(t?.testName);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, t);
      continue;
    }
    const mergedResults = mergeResults(prev?.results, t?.results);
    const prevValue = toNullOrString(prev?.value) ?? (mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : null);
    const nextValue = toNullOrString(t?.value) ?? (mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : null);

    const merged = {
      ...prev,
      ...t,
      results: mergedResults,
      value: nextValue ?? prevValue ?? null,
      unit: toNullOrString(t?.unit) ?? toNullOrString(prev?.unit) ?? null,
      referenceRange: toNullOrString(t?.referenceRange) ?? toNullOrString(prev?.referenceRange) ?? null,
      section: toNullOrString(t?.section) ?? toNullOrString(prev?.section) ?? null,
      page:
        (typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null) ??
        (typeof prev?.page === "number" && Number.isFinite(prev.page) ? prev.page : null),
      remarks: toNullOrString(t?.remarks) ?? toNullOrString(prev?.remarks) ?? null
    };

    map.set(key, merged);
  }

  return Array.from(map.values());
}

function filterDocsTestsToMedicalOnly(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return [];

  const pickLatestValue = (t) => {
    const direct = toNullOrString(t?.value);
    if (direct) return direct;
    const results = Array.isArray(t?.results) ? t.results : [];
    for (let i = results.length - 1; i >= 0; i -= 1) {
      const v = toNullOrString(results[i]?.value);
      if (v) return v;
    }
    return null;
  };

  const addressKeywordRegex =
    /\b(floor|flr|block|layout|phase|road|rd\.?|street|st\.?|sector|nagar|nag\.?|jp\s*nagar|bangalore|bengaluru|karnataka|india|pincode|pin\s*code|zip|district|state)\b/i;
  const looksLikeAddress = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    const hasAddressKeyword = addressKeywordRegex.test(v);
    const hasPinLike = /\b[0-9]{5,6}\b/.test(v);
    const commaCount = (v.match(/,/g) || []).length;
    if (hasAddressKeyword && (commaCount >= 1 || hasPinLike)) return true;
    if (hasPinLike && commaCount >= 2) return true;
    return false;
  };

  const looksLikeMeaninglessValue = (value) => {
    const v = String(value ?? "").trim();
    if (!v) return true;
    if (/^[0-9]{1,3}$/.test(v)) return true;
    if (/^[0-9]{5,6}$/.test(v)) return true;
    return false;
  };

  const keep = [];
  for (const t of list) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const testName = toNullOrString(t?.testName);
    const value = pickLatestValue(t);
    if (!testName || !value) continue;

    if (looksLikeAddress(testName) || looksLikeAddress(value)) continue;

    const unit = toNullOrString(t?.unit);
    const referenceRange = toNullOrString(t?.referenceRange);
    const section = toNullOrString(t?.section);
    const remarks = toNullOrString(t?.remarks);

    const canon = canonicalizeTestName(testName);
    const inDictionary = canon ? PARAMETER_TESTS_CANON.has(canon) : false;

    const hasLabSignals = Boolean(unit || referenceRange || section || remarks);
    if (!inDictionary && !hasLabSignals && looksLikeMeaninglessValue(value)) continue;

    keep.push(t);
  }
  return keep;
}

function looksLikeInterpretationTestName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return true;
  const s = raw.toLowerCase();
  if (["normal", "below", "above", "or higher", "to", "c values", "c value"].includes(s)) return true;
  if (/\bprediab(et)?ic\b/i.test(raw)) return true;
  if (/\bunsatisfactory\b/i.test(raw)) return true;
  if (/\b(good|fair|poor)\s+control\b/i.test(raw)) return true;
  if (/\bcontrol\b/i.test(raw) && !/\bquality\s*control\b/i.test(raw)) return true;
  if (/\b(range|ranges)\b/i.test(raw) && /\b(mg\/dl|mmol\/l|%)\b/i.test(raw)) return true;
  if (/^\s*(to|or)\b/i.test(raw) && /\b(mg\/dl|mmol\/l|%)\b/i.test(raw)) return true;
  if (/^\s*\d+(\.\d+)?\s*(mg\/dl|mmol\/l|%)?\s*(to|\-)\s*\d+(\.\d+)?/i.test(raw)) return true;
  if (/^\s*\d+(\.\d+)?\s*(mg\/dl|mmol\/l|%)\s*$/i.test(raw)) return true;
  return false;
}

function filterDocsTestsToMedicalTestsNoInterpretation(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return [];

  const pickLatestValue = (t) => {
    const direct = toNullOrString(t?.value);
    if (direct) return direct;
    const results = Array.isArray(t?.results) ? t.results : [];
    for (let i = results.length - 1; i >= 0; i -= 1) {
      const v = toNullOrString(results[i]?.value);
      if (v) return v;
    }
    return null;
  };

  const addressKeywordRegex =
    /\b(floor|flr|block|layout|phase|road|rd\.?|street|st\.?|sector|nagar|nag\.?|jp\s*nagar|bangalore|bengaluru|karnataka|india|pincode|pin\s*code|zip|district|state)\b/i;
  const looksLikeAddress = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    const hasAddressKeyword = addressKeywordRegex.test(v);
    const hasPinLike = /\b[0-9]{5,6}\b/.test(v);
    const commaCount = (v.match(/,/g) || []).length;
    if (hasAddressKeyword && (commaCount >= 1 || hasPinLike)) return true;
    if (hasPinLike && commaCount >= 2) return true;
    return false;
  };

  const looksLikeMeaninglessValue = (value) => {
    const v = String(value ?? "").trim();
    if (!v) return true;
    if (/^[0-9]{1,3}$/.test(v)) return true;
    if (/^[0-9]{5,6}$/.test(v)) return true;
    return false;
  };

  const looksMedicalEnoughWithoutDictionary = (t) => {
    const testName = String(t?.testName ?? "").trim();
    const unit = String(t?.unit ?? "").trim();
    const referenceRange = String(t?.referenceRange ?? "").trim();
    const section = String(t?.section ?? "").trim();
    const remarks = String(t?.remarks ?? "").trim();
    const hasLabSignals = Boolean(unit || referenceRange || section || remarks);
    if (hasLabSignals) return true;
    const nameHasMedicalKeywords =
      /\b(glucose|sugar|hba1c|hemoglobin|cholesterol|triglycer|ldl|hdl|vldl|bilirubin|sgot|sgpt|ast|alt|alkaline|alp|urea|creatinine|uric|sodium|potassium|chloride|calcium|magnesium|phosph|tsh|t3|t4|vitamin|b12|d3|ferritin|iron|crp|esr|cbc|wbc|rbc|platelet|neutrophil|lymphocyte|monocyte|eosinophil|basophil|urine|urin|albumin|protein|globulin|a\/g|ratio|hct|mcv|mch|mchc|rdw)\b/i.test(
        testName
      );
    if (!nameHasMedicalKeywords) return false;
    if (looksLikeMeaninglessValue(pickLatestValue(t))) return false;
    return true;
  };

  const keep = [];
  for (const t of list) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const testName = toNullOrString(t?.testName);
    const value = pickLatestValue(t);
    if (!testName || !value) continue;

    if (looksLikeAddress(testName) || looksLikeAddress(value)) continue;
    if (looksLikeInterpretationTestName(testName)) continue;

    const canon = canonicalizeTestName(testName);
    const inDictionary = canon ? PARAMETER_TESTS_CANON.has(canon) : false;
    if (inDictionary) {
      keep.push(t);
      continue;
    }

    if (looksMedicalEnoughWithoutDictionary(t)) keep.push(t);
  }
  return keep;
}

function normalizeCleanerStatus(status, value) {
  const v = requireString(value) ? String(value).trim().toUpperCase() : "";
  const s = requireString(status) ? String(status).trim().toUpperCase() : "";
  if (v === "ABSENT" || s === "ABSENT") return "ABSENT";
  if (v === "PRESENT" || s === "PRESENT") return "PRESENT";
  if (s === "HIGH") return "HIGH";
  if (s === "LOW") return "LOW";
  return "NORMAL";
}

function isMissingDocsTestsField(value) {
  const s = toNullOrString(value);
  if (!s) return true;
  const v = s.trim().toLowerCase();
  if (!v) return true;
  if (v === "not presented") return true;
  if (v === "not_presented") return true;
  if (v === "not found") return true;
  if (v === "not_found") return true;
  if (v === "na" || v === "n/a") return true;
  if (v === "-" || v === "--") return true;
  return false;
}

function mergeAndDedupeCleanedTestsByName(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length <= 1) return list;

  const normalizeDateKey = (v) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    return s ? s.toLowerCase() : "";
  };

  const mergeResults = (a, b) => {
    const out = [];
    const seen = new Set();
    const push = (r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return;
      const value = toNullOrString(r?.value);
      if (isMissingDocsTestsField(value)) return;
      const dateAndTime = toNullOrString(r?.dateAndTime);
      const key = `${normalizeDateKey(dateAndTime)}|${String(value).trim().toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ value: String(value).trim(), dateAndTime: isMissingDocsTestsField(dateAndTime) ? null : String(dateAndTime).trim() });
    };
    for (const r of Array.isArray(a) ? a : []) push(r);
    for (const r of Array.isArray(b) ? b : []) push(r);
    return out;
  };

  const pickBestText = (a, b) => {
    const aa = isMissingDocsTestsField(a) ? null : String(a).trim();
    const bb = isMissingDocsTestsField(b) ? null : String(b).trim();
    if (aa && bb) return bb.length >= aa.length ? bb : aa;
    return bb ?? aa ?? null;
  };

  const statusPriority = (s) => {
    const v = String(s ?? "").trim().toUpperCase();
    if (v === "HIGH") return 4;
    if (v === "LOW") return 3;
    if (v === "PRESENT") return 2;
    if (v === "ABSENT") return 2;
    return 1;
  };

  const map = new Map();
  const passthrough = [];

  for (const t of list) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const testName = toNullOrString(t?.testName);
    const key = canonicalizeDocsTestsMergeKey(testName);
    if (!key) {
      passthrough.push(t);
      continue;
    }

    const prev = map.get(key);
    if (!prev) {
      const results = mergeResults([], t?.results);
      const value = isMissingDocsTestsField(t?.value) ? null : toNullOrString(t?.value);
      map.set(key, { ...t, testName: stripDocsTestsMethodSuffix(testName) ?? testName, value, results });
      continue;
    }

    const mergedResults = mergeResults(prev?.results, t?.results);
    const prevValue = isMissingDocsTestsField(prev?.value) ? null : toNullOrString(prev?.value);
    const nextValue = isMissingDocsTestsField(t?.value) ? null : toNullOrString(t?.value);
    const value =
      nextValue ??
      prevValue ??
      (mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : null);

    const merged = {
      ...prev,
      ...t,
      testName: (() => {
        const a = toNullOrString(prev?.testName);
        const b = toNullOrString(t?.testName);
        const aa = stripDocsTestsMethodSuffix(a) ?? a;
        const bb = stripDocsTestsMethodSuffix(b) ?? b;
        if (aa && bb) return String(aa).length <= String(bb).length ? aa : bb;
        return bb ?? aa ?? null;
      })(),
      results: mergedResults,
      value,
      unit: pickBestText(prev?.unit, t?.unit),
      referenceRange: pickBestText(prev?.referenceRange, t?.referenceRange),
      section: pickBestText(prev?.section, t?.section),
      remarks: pickBestText(prev?.remarks, t?.remarks),
      page:
        (typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null) ??
        (typeof prev?.page === "number" && Number.isFinite(prev.page) ? prev.page : null),
      status: (() => {
        const a = toNullOrString(prev?.status);
        const b = toNullOrString(t?.status);
        return statusPriority(b) >= statusPriority(a) ? (b ?? a) : (a ?? b);
      })()
    };

    map.set(key, merged);
  }

  const mergedList = [...passthrough, ...Array.from(map.values())];
  return mergedList.filter((t) => {
    const hasValue = !isMissingDocsTestsField(t?.value);
    const hasResult =
      Array.isArray(t?.results) && t.results.some((r) => !isMissingDocsTestsField(r?.value));
    const hasRange = !isMissingDocsTestsField(t?.referenceRange);
    return hasValue || hasResult || hasRange;
  });
}

async function cleanDocsTestsWithAi({ openai, provider, tests, debug }) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return { tests: [] };

  const normalizeDateKey = (v) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    return s ? s.toLowerCase() : "";
  };
  const buildOriginalResultsMap = (incoming) => {
    const map = new Map();
    for (const t of Array.isArray(incoming) ? incoming : []) {
      const key = canonicalizeDocsTestsMergeKey(t?.testName);
      if (!key) continue;
      const prev = map.get(key) ?? [];
      const results = Array.isArray(t?.results) ? t.results : [];
      if (results.length > 0) {
        for (const r of results) {
          const value = toNullOrString(r?.value);
          if (isMissingDocsTestsField(value)) continue;
          const dateAndTime = toNullOrString(r?.dateAndTime);
          prev.push({ value, dateAndTime: isMissingDocsTestsField(dateAndTime) ? null : String(dateAndTime).trim() });
        }
      } else {
        const value = toNullOrString(t?.value);
        if (!isMissingDocsTestsField(value)) prev.push({ value, dateAndTime: null });
      }
      map.set(key, prev);
    }
    return map;
  };
  const originalResultsByKey = buildOriginalResultsMap(list);

  const dictionaryText = bulletList(PARAMETER_TESTS);
  const dictionaryPrompt = capTextForPrompt(dictionaryText, 12000);
  const rowsJson = JSON.stringify(
    list.map((t) => ({
      testName: toNullOrString(t?.testName),
      results: Array.isArray(t?.results)
        ? t.results.map((r) => ({
          value: toNullOrString(r?.value),
          dateAndTime: toNullOrString(r?.dateAndTime)
        }))
        : toNullOrString(t?.value)
          ? [{ value: toNullOrString(t?.value), dateAndTime: null }]
          : [],
      unit: toNullOrString(t?.unit),
      referenceRange: toNullOrString(t?.referenceRange),
      status: toNullOrString(t?.status),
      section: toNullOrString(t?.section),
      page: typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null,
      remarks: toNullOrString(t?.remarks)
    }))
  );
  const rowsForPrompt = capTextForPrompt(rowsJson, 20000);

  const systemPrompt = DOCS_TESTS_CLEAN_SYSTEM_PROMPT;
  const userPrompt = buildDocsTestsCleanUserPrompt({ dictionaryPrompt, rowsForPrompt });

  const resolvedProvider = normalizeAiProvider(provider);
  let content = "";
  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: userPrompt }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsed =
    (resolvedProvider === "claude" ? safeParseJsonObjectLoose(content) : safeParseJsonObject(content)) ??
    safeParseJsonArrayLoose(content) ??
    null;

  if (!parsed && resolvedProvider === "claude") {
    parsed = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint: DOCS_TESTS_CLEAN_SCHEMA_HINT,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
  }

  const categories = normalizeCategorizedDocsTestsIncoming(parsed ?? {});
  const normalizedCategories = categories
    .map((c) => {
      const name = requireString(c?.categoryName) ? String(c.categoryName).trim() : "Other Tests";
      const incomingTests = Array.isArray(c?.tests) ? c.tests : [];
      const normalized = incomingTests.map((t) => ({
        ...t,
        status: normalizeCleanerStatus(t?.status, t?.value),
        results:
          Array.isArray(t?.results) && t.results.length > 0
            ? t.results
            : toNullOrString(t?.value)
              ? [{ value: toNullOrString(t?.value), dateAndTime: null }]
              : [],
        testName: (() => {
          const raw = toNullOrString(t?.testName);
          if (!raw) return raw;
          const stripped = stripDocsTestsMethodSuffix(raw) ?? raw;
          const key = canonicalizeTestName(stripped);
          const preferred = key ? PARAMETER_TESTS_PREFERRED.get(key) : null;
          return preferred ?? stripped;
        })()
      }));
      const filtered = filterDocsTestsToMedicalTestsNoInterpretation(normalized);
      const deduped = mergeAndDedupeCleanedTestsByName(filtered);
      if (deduped.length === 0) return null;
      const hydrated = deduped.map((t) => {
        const key = canonicalizeDocsTestsMergeKey(t?.testName);
        const originalResults = key ? originalResultsByKey.get(key) : null;
        if (!key || !Array.isArray(originalResults) || originalResults.length === 0) return t;

        const byDate = new Map();
        const push = (r, source) => {
          if (!r || typeof r !== "object" || Array.isArray(r)) return;
          const value = toNullOrString(r?.value);
          if (isMissingDocsTestsField(value)) return;
          const dateAndTime = toNullOrString(r?.dateAndTime);
          const dateKey = normalizeDateKey(dateAndTime);
          const prev = byDate.get(dateKey) ?? { original: [], ai: [] };
          const entry = {
            value,
            dateAndTime: isMissingDocsTestsField(dateAndTime) ? null : String(dateAndTime).trim()
          };
          if (source === "original") prev.original.push(entry);
          else prev.ai.push(entry);
          byDate.set(dateKey, prev);
        };

        for (const r of Array.isArray(t?.results) ? t.results : []) push(r, "ai");
        for (const r of originalResults) push(r, "original");

        const mergedResults = [];
        for (const entry of byDate.values()) {
          if (entry.original.length > 0) mergedResults.push(...entry.original);
          else mergedResults.push(...entry.ai);
        }

        const nextValue =
          mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : toNullOrString(t?.value);

        return { ...t, results: mergedResults, value: nextValue ?? null };
      });

      return { categoryName: name || "Other Tests", tests: mergeAndDedupeCleanedTestsByName(hydrated) };
    })
    .filter(Boolean);

  if (debug) return { tests: normalizedCategories, raw: content };
  return { tests: normalizedCategories };
}

async function extractTestsFromPdfs({ openai, pdfFiles, extractedText, testNames, provider }) {
  const systemPrompt = TESTS_FROM_PDFS_SYSTEM_PROMPT;
  const userPrompt = buildTestsFromPdfsUserPrompt({ testList: bulletList(testNames) });

  let content = "";
  const resolvedProvider = normalizeAiProvider(provider);
  const textForPrompt = requireString(extractedText)
    ? extractedText
    : resolvedProvider === "claude"
      ? await extractPdfTextRawForPrompt(pdfFiles)
      : "";

  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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

async function extractAllBloodParametersFromText({ openai, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = BLOOD_TEXT_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = BLOOD_SCHEMA_HINT;

  let content = "";
  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 12000)}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[REPORT_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsedJson =
    (resolvedProvider === "claude" ? safeParseJsonObjectLoose(content) : safeParseJsonObject(content)) ?? null;
  if (!parsedJson && resolvedProvider === "claude") {
    parsedJson = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
  }
  if (resolvedProvider === "claude") {
    const maybeTests = normalizeLooseIncomingTests(parsedJson ?? {});
    if (maybeTests.length === 0) {
      const fallbackUserPrompt = BLOOD_TEXT_FALLBACK_CLAUDE_USER_PROMPT;

      const response2 = await anthropicCreateJsonMessage({
        system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: `${fallbackUserPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 9000)}` }]
          }
        ],
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        temperature: 0,
        maxTokens: 4096
      });
      const content2 = getTextFromAnthropicMessageResponse(response2);
      let parsed2 = safeParseJsonObjectLoose(content2);
      if (!parsed2) {
        parsed2 = await repairJsonObjectWithClaude({
          rawText: content2,
          schemaHint,
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
        });
      }
      parsedJson = parsed2 ?? parsedJson;
      content = maybeTests.length > 0 ? content : content2;
    }
  }

  const tests = normalizeLooseIncomingTests(parsedJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractDocsTestsFromText({ openai, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = DOCS_TESTS_TEXT_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = DOCS_TESTS_SCHEMA_HINT;

  let content = "";
  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 20000)}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[REPORT_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsedJson =
    (resolvedProvider === "claude" ? safeParseJsonObjectLoose(content) : safeParseJsonObject(content)) ??
    safeParseJsonArrayLoose(content) ??
    null;

  if (!parsedJson && resolvedProvider === "claude") {
    const repairedObject = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
    parsedJson = repairedObject ?? (await repairJsonArrayWithClaude({ rawText: content, schemaHint, model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022" }));
  }

  const tests = normalizeLooseIncomingTests(parsedJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractDocsTestsFromImagesAndText({ openai, imageFiles, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = DOCS_TESTS_IMAGES_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = DOCS_TESTS_SCHEMA_HINT;

  let content = "";

  if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 14000)}` }];
    for (const f of imageFiles) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const contentParts = [
      { type: "text", text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 14000)}` }
    ];
    for (const f of imageFiles) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });

    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsedJson =
    (resolvedProvider === "claude" ? safeParseJsonObjectLoose(content) : safeParseJsonObject(content)) ??
    safeParseJsonArrayLoose(content) ??
    null;

  if (!parsedJson && resolvedProvider === "claude") {
    const repairedObject = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
    parsedJson = repairedObject ?? (await repairJsonArrayWithClaude({ rawText: content, schemaHint, model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022" }));
  }

  const tests = normalizeLooseIncomingTests(parsedJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractAllBloodParametersFromImagesAndText({ openai, imageFiles, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = BLOOD_IMAGES_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = BLOOD_SCHEMA_HINT;

  let content = "";
  if (resolvedProvider === "claude") {
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
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });

    content = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsedJson =
    (resolvedProvider === "claude"
      ? safeParseJsonObjectLoose(content)
      : safeParseJsonObject(content)) ?? null;

  let finalJson = parsedJson;
  if (!finalJson && resolvedProvider === "claude") {
    finalJson = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
  }

  const tests = normalizeLooseIncomingTests(finalJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractTestsFromImagesAndText({ openai, imageFiles, extractedText, testNames, provider }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = buildTestsFromImagesUserPrompt({ testList: bulletList(testNames) });

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
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
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
      { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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
  const systemPrompt = HEART_RELATED_TESTS_SYSTEM_PROMPT;
  const userPrompt = buildHeartRelatedTestsUserPrompt({
    heartTestsList: bulletList(HEART_RELATED_EXTRACT_TESTS)
  });

  let content = "";
  const resolvedProvider = normalizeAiProvider(provider);
  const textForPrompt = requireString(extractedText)
    ? extractedText
    : resolvedProvider === "claude"
      ? await extractPdfTextRawForPrompt(pdfFiles)
      : "";

  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = buildUrinogramUserPrompt({ bulletList });

  const resolvedProvider = normalizeAiProvider(provider);
  if (resolvedProvider === "claude") {
    const parts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 8000, URINOGRAM_ANCHOR_TERMS)}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }

    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[PDF_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  } else if (imageList.length > 0 && pdfList.length === 0) {
    const contentParts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 6000, URINOGRAM_ANCHOR_TERMS)}`
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
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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
      ? `\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 6000, URINOGRAM_ANCHOR_TERMS)}`
      : "";
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
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

gptRouter.post(
  "/advanced-body-composition",
  upload.single("file"),
  createAdvancedBodyCompositionHandler(getGptControllerContext)
);

gptRouter.post(
  "/heart-urine-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createHeartUrineAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/docs-tests",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createDocsTestsHandler(getGptControllerContext)
);

gptRouter.post("/docs-tests-clean", upload.none(), createDocsTestsCleanHandler(getGptControllerContext));

gptRouter.post("/docs-tests-excel", upload.none(), createDocsTestsExcelHandler(getGptControllerContext));

gptRouter.post(
  "/heart-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createHeartAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/urine-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createUrineAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/blood-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createBloodAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/other-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createOtherAnalysisHandler(getGptControllerContext)
);

let _gptControllerContext = null;

function getGptControllerContext() {
  if (_gptControllerContext) return _gptControllerContext;
  _gptControllerContext = {
    requireString,
    getOpenAIClient,
    getAiProviderFromReq,
    hasAnthropicKey,
    getTextFromAnthropicMessageResponse,
    anthropicCreateJsonMessage,
    parseMaybeJson,
    parseMaybeNumber,
    getTextFromMessageContent,
    getTextFromResponsesOutput,
    isImageMime,
    isPdfMime,
    isDocxMime,
    collectUploadedFiles,
    extractPdfTextRawForPrompt,
    extractPdfTextForPrompt,
    extractPdfTextForBloodPrompt,
    extractDocxTextForPrompt,
    extractDocxTextForBloodPrompt,
    safeParseJsonObject,
    safeParseJsonObjectLoose,
    safeParseJsonArrayLoose,
    stripBrandingFromAdvancedBodyCompositionPayload,
    toNullOrString,
    canonicalizeTestName,
    PARAMETER_TESTS_PREFERRED,
    normalizeLooseIncomingTests,
    buildDocsTestsExcelBuffer,
    getChunkParams,
    estimateTotalTestsInReportText,
    sliceTextFixedWithOverlap,
    splitTextWindows,
    extractDocsTestsFromImagesAndText,
    extractDocsTestsFromText,
    mergeTestEntries,
    isMissingDocsTestsField,
    filterDocsTestsToMedicalOnly,
    heuristicExtractDocsTestsFromText,
    cleanDocsTestsWithAi,
    extractHeartRelatedTestsFromPdfs,
    extractUrinogramTestsFromPdfs,
    chunkArray,
    mapWithConcurrency,
    PARAMETER_TESTS_FOR_EXTRACTION,
    extractTestsFromPdfs,
    buildCompleteUrinogramTests,
    buildPresentedCategory,
    BLOOD_PARAMETER_TESTS,
    OTHER_PARAMETER_TESTS,
    sliceTextFixed,
    extractAllBloodParametersFromImagesAndText,
    extractAllBloodParametersFromText,
    sliceChunkFixed,
    OTHER_ANALYSIS_EXTRACT_TESTS,
    buildStrictCategory
  };
  return _gptControllerContext;
}
