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
  const system = `You are a JSON repair tool.

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not hallucinate new fields.`;

  const user = `${requireString(schemaHint) ? schemaHint : ""}

You are given a model output that was supposed to be a single JSON object, but it may be truncated or invalid.
Your job:
- Extract the largest valid JSON object you can recover.
- If there are incomplete trailing objects/arrays, drop the incomplete tail.
- Output ONE JSON object only.

[MODEL_OUTPUT]
${cleaned}`;

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
  const system = `You are a JSON repair tool.

Return ONLY valid JSON.
Do not return markdown.
Do not return explanations.
Do not hallucinate new fields.`;

  const user = `${requireString(schemaHint) ? schemaHint : ""}

You are given a model output that was supposed to be a single JSON array, but it may be truncated or invalid.
Your job:
- Extract the largest valid JSON array you can recover.
- If there are incomplete trailing objects/arrays, drop the incomplete tail.
- Output ONE JSON array only.

[MODEL_OUTPUT]
${cleaned}`;

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
      const value = toNullOrString(t?.value) ?? toNullOrString(t?.observed_value);
      const unit = toNullOrString(t?.unit) ?? toNullOrString(t?.units);
      const referenceRange =
        toNullOrString(t?.referenceRange) ?? toNullOrString(t?.reference_range) ?? toNullOrString(t?.range);
      const status = toNullOrString(t?.status);
      const computed = computeStatus({ value, referenceRange, fallbackStatus: status });
      const section = toNullOrString(t?.section);
      const page = typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null;
      const remarks = toNullOrString(t?.remarks);
      return { testName, value, unit, referenceRange, status: computed, section, page, remarks };
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

function filterDocsTestsToMedicalOnly(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return [];

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
    const value = toNullOrString(t?.value);
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
    if (looksLikeMeaninglessValue(t?.value)) return false;
    return true;
  };

  const keep = [];
  for (const t of list) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const testName = toNullOrString(t?.testName);
    const value = toNullOrString(t?.value);
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

async function cleanDocsTestsWithAi({ openai, provider, tests, debug }) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return { tests: [] };

  const dictionaryText = bulletList(PARAMETER_TESTS);
  const dictionaryPrompt = capTextForPrompt(dictionaryText, 12000);
  const rowsJson = JSON.stringify(
    list.map((t) => ({
      testName: toNullOrString(t?.testName),
      value: toNullOrString(t?.value),
      unit: toNullOrString(t?.unit),
      referenceRange: toNullOrString(t?.referenceRange),
      status: toNullOrString(t?.status),
      section: toNullOrString(t?.section),
      page: typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null,
      remarks: toNullOrString(t?.remarks)
    }))
  );
  const rowsForPrompt = capTextForPrompt(rowsJson, 20000);

  const systemPrompt = `You are a medical report data cleaner and extractor.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.`;

  const userPrompt = `Input: Raw OCR/text extracted from a lab report table (may contain noise, descriptions, broken rows, and mixed urine/blood tests).

Your job:
- Identify and extract ONLY real medical test entries (lab parameters).
- Clean and normalize the data.
- Remove explanatory paragraphs and irrelevant text.
- Standardize status values (Normal, High, Low, Absent, Present).
- Keep the original numeric value and unit exactly as given.
- If the result says "ABSENT", store result as "Absent".
- Drop rows that are NOT medical tests (interpretation / classification / ranges / labels / address blocks).
- Examples of rows to DROP: "Normal", "Prediabetic", "Good Control", "Fair Control", "Unsatisfactory Control", "c values", "to 125 mg/dl", "or higher", and pure range/category lines.
- Keep medical parameters even if they are not in the dictionary, as long as they are clearly medical (have unit/referenceRange/section/remarks or are common lab parameters).
- Test name normalization is critical:
  - Replace long/verbose titles with a concise industry-standard test name.
  - Do NOT include units, reference ranges, or extra explanatory words inside testName.
  - Prefer 1–3 words when possible, but if the industry-standard name is longer, keep the standard name.
  - If the test exists in the dictionary, set testName to EXACTLY one of the dictionary test names (copy spelling as-is) and pick the shortest standard variant.
  - If the test does not exist in the dictionary, keep the original testName unchanged (do not invent a new name).

Medical dictionary (valid test names):
${dictionaryPrompt}

Input rows (JSON array):
${rowsForPrompt}

Return clean JSON ONLY with this structure:
{
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "Normal"|"High"|"Low"|"Absent"|"Present",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

  const resolvedProvider = normalizeAiProvider(provider);
  let content = "";
  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }]
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
      schemaHint: `Schema: {"tests":[{"testName":"","value":"","unit":null,"referenceRange":null,"status":"","section":null,"page":null,"remarks":null}]}`,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
  }

  const cleaned = normalizeLooseIncomingTests(parsed ?? {});
  const normalized = cleaned.map((t) => ({
    ...t,
    status: normalizeCleanerStatus(t?.status, t?.value),
    testName: (() => {
      const raw = toNullOrString(t?.testName);
      if (!raw) return raw;
      const key = canonicalizeTestName(raw);
      const preferred = key ? PARAMETER_TESTS_PREFERRED.get(key) : null;
      return preferred ?? raw;
    })()
  }));
  const filtered = filterDocsTestsToMedicalTestsNoInterpretation(normalized);
  if (debug) return { tests: filtered, raw: content };
  return { tests: filtered };
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

async function extractAllBloodParametersFromText({ openai, extractedText, provider, debug }) {
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Read the report text systematically (in order). Treat it like reading the PDF page-by-page.

Extract EVERY single parameter/value row you can find, including:
- Ratios and derived values
- Any "Physical Examination", "Chemical Examination", "Microscopy", "Impression", "Remarks" style values
- Any lab table line-items (even if they are not typical blood markers)

Rules:
- Extract ONLY what is actually present with an observed value in the report text.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written.
- If unit/range/remarks are missing, set them to null.
- Prefer one row per distinct parameter occurrence; dedupe only if exact duplicates.

Status rules:
- If referenceRange is available AND value is numeric (or contains a numeric), set status to LOW/HIGH/NORMAL accordingly.
- Otherwise set status to NORMAL.

Self-audit before returning JSON:
- Page/order check: confirm you processed the text from start to end without skipping blocks.
- Status verification: confirm any LOW/HIGH assignment is supported by the reference range.
- Count check: ensure tests.length matches the number of extracted line-items (no obvious omissions).

Important output constraint:
- Keep output compact to avoid truncation.
- Return at most 120 tests for this chunk.

Return ONLY valid JSON with this structure (no extra wrapper text):
{
  "meta": {
    "pagesAudited": number|null,
    "parametersExtracted": number,
    "qualityChecklist": {
      "pageCountChecked": boolean,
      "statusVerified": boolean,
      "countChecked": boolean,
      "noHallucinations": boolean,
      "deduped": boolean
    }
  },
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = `Schema:
{
  "tests": [
    { "testName": string, "value": string, "unit": string|null, "referenceRange": string|null, "status": "LOW"|"HIGH"|"NORMAL", "section": string|null, "page": number|null, "remarks": string|null }
  ]
}`;

  let content = "";
  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
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
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
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
      const fallbackUserPrompt = `Extract ONLY medical test / lab parameter rows from the report text.

Hard exclusions (do NOT extract these even if they contain numbers):
- Patient address, phone, email, name, age, gender
- Lab / hospital address, doctor address, billing details
- IDs (patient id, sample id, barcode), page headers/footers
- Any location/address line (e.g. contains Floor/Block/Road/Nagar/Bangalore/Pincode)

Rules:
- Extract ONLY line-items that are clearly medical test parameters (analytes, hormones, antibodies, ratios, urinalysis line-items, etc).
- Each extracted row MUST have an observed value for the parameter.
- Ignore serial numbers / row indices.
- If unit/referenceRange/section/page/remarks are missing, set them to null.
- If you are unsure whether a row is a medical test, exclude it.
- Keep value text exactly as written.

Return JSON only:
{
  "tests": [
    { "testName": "", "value": "", "unit": null, "referenceRange": null, "status": "NORMAL", "section": null, "page": null, "remarks": null }
  ]
}`;

      const response2 = await anthropicCreateJsonMessage({
        system: `${systemPrompt}\n\nOutput must be JSON.`,
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
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Read the report text systematically (in order), like reading the PDF page-by-page.

Goal:
- Extract ONLY medical test / lab parameter results that are present in the document (blood tests, biochemistry, immunology, hormones, urinalysis, ratios, etc).

Hard exclusions (do NOT extract these even if they contain numbers):
- Patient details: name, age, sex, address, phone, email
- Lab/hospital address, branch address, doctor address
- IDs: patient id, sample id, barcode, accession no, bill no
- Dates/times, page headers/footers, reference text blocks that are not results
- Any location/address line (e.g. contains Floor/Block/Road/Nagar/Bangalore/Pincode)

Row validity rules:
- Each extracted row must be a real medical parameter/test name (use your medical knowledge as a dictionary).
- Each row MUST have an observed value for that parameter.
- Ignore serial numbers / row indices.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written.
- If unit/referenceRange/section/page/remarks are missing, set them to null.
- If you are unsure whether a row is a medical test, exclude it.

Self-audit before returning JSON:
- Remove any non-medical rows (especially addresses/IDs).
- Double-check that each value is copied exactly from the report text.
- Verify LOW/HIGH is only set when supported by referenceRange.

Return ONLY valid JSON with this structure (no extra wrapper text):
{
  "meta": {
    "pagesAudited": number|null,
    "parametersExtracted": number,
    "qualityChecklist": {
      "pageCountChecked": boolean,
      "statusVerified": boolean,
      "countChecked": boolean,
      "noHallucinations": boolean,
      "deduped": boolean
    }
  },
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = `Schema:
{
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

  let content = "";
  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}\n\nOutput must be JSON.`,
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
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
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
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Read the report page-by-page from the images (and extracted text) carefully.

Goal:
- Extract ONLY medical test / lab parameter results that are present in the document (blood tests, biochemistry, immunology, hormones, urinalysis, ratios, etc).

Hard exclusions (do NOT extract these even if they contain numbers):
- Patient details: name, age, sex, address, phone, email
- Lab/hospital address, branch address, doctor address
- IDs: patient id, sample id, barcode, accession no, bill no
- Dates/times, page headers/footers, reference text blocks that are not results
- Any location/address line (e.g. contains Floor/Block/Road/Nagar/Bangalore/Pincode)

Row validity rules:
- Each extracted row must be a real medical parameter/test name (use your medical knowledge as a dictionary).
- Each row MUST have an observed value for that parameter.
- Ignore serial numbers / row indices.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written.
- If unit/referenceRange/section/page/remarks are missing, set them to null.
- Do NOT skip any row in any RESULTS table.
- If you are unsure whether a row is a medical test, exclude it.

Self-audit before returning JSON:
- Remove any non-medical rows (especially addresses/IDs).
- Double-check that each value is copied exactly from the report.
- Verify LOW/HIGH is only set when supported by referenceRange.

Return ONLY valid JSON with this structure (no extra wrapper text):
{
  "meta": {
    "pagesAudited": number|null,
    "parametersExtracted": number,
    "qualityChecklist": {
      "pageCountChecked": boolean,
      "statusVerified": boolean,
      "countChecked": boolean,
      "noHallucinations": boolean,
      "deduped": boolean
    }
  },
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}
  
`;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = `Schema:
{
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

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
      system: `${systemPrompt}\n\nOutput must be JSON.`,
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
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
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
  const systemPrompt = `You are a medical report extraction engine.

Return ONLY valid JSON.
Do not return explanations.
Do not return markdown.
Do not add extra fields.
Do not hallucinate.
Extract values exactly as written in the report.`;

  const userPrompt = `Read the report images and accompanying extracted text systematically (page-by-page).

Extract EVERY single parameter/value row you can find, including:
- Ratios and derived values
- Any "Physical Examination", "Chemical Examination", "Microscopy", "Impression", "Remarks" style values
- Any lab table line-items (even if they are not typical blood markers)

Rules:
- Extract ONLY what is actually present with an observed value in the images/text.
- Do NOT invent missing tests.
- Keep the observed value text exactly as written.
- If unit/range/remarks are missing, set them to null.
- Prefer one row per distinct parameter occurrence; dedupe only if exact duplicates.

Status rules:
- If referenceRange is available AND value is numeric (or contains a numeric), set status to LOW/HIGH/NORMAL accordingly.
- Otherwise set status to NORMAL.

Self-audit before returning JSON:
- Page/order check: confirm you processed the content sequentially.
- Status verification: confirm any LOW/HIGH assignment is supported by the reference range.
- Count check: ensure tests.length matches the number of extracted line-items (no obvious omissions).

Important output constraint:
- Keep output compact to avoid truncation.
- Return at most 120 tests for this chunk.

Return ONLY valid JSON with this structure (no extra wrapper text):
{
  "meta": {
    "pagesAudited": number|null,
    "parametersExtracted": number,
    "qualityChecklist": {
      "pageCountChecked": boolean,
      "statusVerified": boolean,
      "countChecked": boolean,
      "noHallucinations": boolean,
      "deduped": boolean
    }
  },
  "tests": [
    {
      "testName": string,
      "value": string,
      "unit": string|null,
      "referenceRange": string|null,
      "status": "LOW"|"HIGH"|"NORMAL",
      "section": string|null,
      "page": number|null,
      "remarks": string|null
    }
  ]
}`;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = `Schema:
{
  "tests": [
    { "testName": string, "value": string, "unit": string|null, "referenceRange": string|null, "status": "LOW"|"HIGH"|"NORMAL", "section": string|null, "page": number|null, "remarks": string|null }
  ]
}`;

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
      system: `${systemPrompt}\n\nOutput must be JSON.`,
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
        { role: "system", content: `${systemPrompt}\n\nOutput must be JSON.` },
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
      '      "rightArmKg": number|null, "rightArmPct": number|null, "leftArmKg": number|null, "leftArmPct": number|null, "trunkKg": number|null, "trunkPct": number|null, "rightLegKg": number|null, "rightLegPct": number|null, "leftLegKg": number|null, "leftLegPct": number|null',
      "    },",
      '    "segmentalFat": {',
      '      "rightArmKg": number|null, "rightArmPct": number|null, "leftArmKg": number|null, "leftArmPct": number|null, "trunkKg": number|null, "trunkPct": number|null, "rightLegKg": number|null, "rightLegPct": number|null, "leftLegKg": number|null, "leftLegPct": number|null',
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
  "/docs-tests",
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

    const debugAi = process.env.AI_DEBUG === "1";

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

    const estimatedTotalTestsInReport = estimateTotalTestsInReportText(extractedText);

    if (!requireString(extractedText) && imageFiles.length === 0) {
      if (provider === "claude") {
        return res.status(400).json({
          error:
            "Claude could not extract tests because this PDF has no readable text. Please upload images (JPG/PNG) of the report pages or use GPT for scanned PDFs."
        });
      }
      const docs = { data: false, tests: [] };
      const payload = {
        docs,
        chunkIndex: 0,
        totalChunks: 1,
        chunkSize: 1,
        estimatedTotalTestsInReport
      };
      if (debugAi) {
        payload.debug = {
          provider,
          extractedTextLength: 0,
          pdfTextLength: typeof pdfText === "string" ? pdfText.length : 0,
          docxTextLength: typeof docxText === "string" ? docxText.length : 0,
          imageCount: Array.isArray(imageFiles) ? imageFiles.length : 0
        };
      }
      return res.json(payload);
    }

    const { safeIndex, totalChunks, chunkText, chunkSize } = sliceTextFixedWithOverlap(
      extractedText,
      chunkIndex,
      4,
      1200
    );
    const estimatedTotalTestsInChunk = estimateTotalTestsInReportText(chunkText);

    const windows = splitTextWindows(chunkText, 12000, 600, 8);
    const aiIncoming = [];
    let lastRaw = "";
    if (imageFiles.length > 0) {
      const extraction = await extractDocsTestsFromImagesAndText({
        openai,
        imageFiles,
        extractedText: chunkText,
        provider,
        debug: debugAi
      });
      lastRaw = typeof extraction?.raw === "string" ? extraction.raw : "";
      const incomingTests = Array.isArray(extraction?.tests) ? extraction.tests : [];
      aiIncoming.push(...incomingTests);
    } else if (windows.length > 0) {
      for (const w of windows) {
        const extraction = await extractDocsTestsFromText({
          openai,
          extractedText: w,
          provider,
          debug: debugAi
        });
        lastRaw = typeof extraction?.raw === "string" ? extraction.raw : lastRaw;
        const incomingTests = Array.isArray(extraction?.tests) ? extraction.tests : [];
        aiIncoming.push(...incomingTests);
      }
    }

    const heuristicTests = heuristicExtractDocsTestsFromText(chunkText);
    const merged = mergeTestEntries(aiIncoming, heuristicTests);
    const chunkTests = merged.filter((t) => toNullOrString(t?.value) != null);
    const filteredChunkTests = filterDocsTestsToMedicalOnly(chunkTests);

    if (provider === "claude" && filteredChunkTests.length === 0) {
      const payload = {
        error:
          "Claude returned no parsable tests for this chunk. This usually happens when the response was truncated or not valid JSON. Enable AI_DEBUG=1 to see the response preview, or try the next chunk / use images."
      };
      if (debugAi) {
        payload.debug = {
          provider,
          extractedTextLength: typeof extractedText === "string" ? extractedText.length : 0,
          chunkTextLength: typeof chunkText === "string" ? chunkText.length : 0,
          pdfTextLength: typeof pdfText === "string" ? pdfText.length : 0,
          docxTextLength: typeof docxText === "string" ? docxText.length : 0,
          imageCount: Array.isArray(imageFiles) ? imageFiles.length : 0,
          aiResponsePreview: lastRaw ? lastRaw.slice(0, 2000) : null
        };
      }
      return res.status(502).json(payload);
    }

    const hasAny = filteredChunkTests.length > 0;
    const docs = { data: hasAny, tests: filteredChunkTests };
    const payload = {
      docs,
      chunkIndex: safeIndex,
      totalChunks,
      chunkSize,
      estimatedTotalTestsInReport,
      estimatedTotalTestsInChunk
    };
    if (debugAi) {
      payload.debug = {
        provider,
        extractedTextLength: typeof extractedText === "string" ? extractedText.length : 0,
        chunkTextLength: typeof chunkText === "string" ? chunkText.length : 0,
        pdfTextLength: typeof pdfText === "string" ? pdfText.length : 0,
        docxTextLength: typeof docxText === "string" ? docxText.length : 0,
        imageCount: Array.isArray(imageFiles) ? imageFiles.length : 0,
        extractedTests: filteredChunkTests.length,
        aiResponsePreview: lastRaw ? lastRaw.slice(0, 2000) : null,
        aiIncomingTests: aiIncoming.length,
        heuristicTests: Array.isArray(heuristicTests) ? heuristicTests.length : 0,
        windows: windows.length
      };
    }
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

gptRouter.post("/docs-tests-clean", upload.none(), async (req, res) => {
  try {
    const provider = getAiProviderFromReq(req);
    const openai = provider === "openai" ? getOpenAIClient() : null;
    if (provider === "openai" && !openai) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (provider === "claude" && !hasAnthropicKey()) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
    }

    const raw = req?.body?.testsJson;
    if (!requireString(raw)) {
      return res.status(400).json({ error: "testsJson is required" });
    }

    const debugAi = process.env.AI_DEBUG === "1";
    const parsedObject = safeParseJsonObject(raw);
    const parsedArray = parsedObject ? null : safeParseJsonArrayLoose(raw);
    const normalized =
      Array.isArray(parsedArray) ? normalizeLooseIncomingTests({ tests: parsedArray }) : normalizeLooseIncomingTests(parsedObject ?? {});

    const cleaned = await cleanDocsTestsWithAi({
      openai,
      provider,
      tests: normalized,
      debug: debugAi
    });

    const tests = Array.isArray(cleaned?.tests) ? cleaned.tests : [];
    const payload = { tests };
    if (debugAi) payload.raw = typeof cleaned?.raw === "string" ? cleaned.raw : null;
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

gptRouter.post("/docs-tests-excel", upload.none(), async (req, res) => {
  try {
    const raw = req?.body?.testsJson;
    if (!requireString(raw)) {
      return res.status(400).json({ error: "testsJson is required" });
    }

    const parsedObject = safeParseJsonObject(raw);
    const parsedArray = parsedObject ? null : safeParseJsonArrayLoose(raw);
    const normalized =
      Array.isArray(parsedArray) ? normalizeLooseIncomingTests({ tests: parsedArray }) : normalizeLooseIncomingTests(parsedObject ?? {});

    const standardized = normalized.map((t) => {
      const name = toNullOrString(t?.testName);
      if (!name) return t;
      const key = canonicalizeTestName(name);
      const preferred = key ? PARAMETER_TESTS_PREFERRED.get(key) : null;
      return { ...t, testName: preferred ?? name };
    });
    const buffer = await buildDocsTestsExcelBuffer(standardized);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="docs-tests.xlsx"');
    res.send(buffer);
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

    const debugAi = process.env.AI_DEBUG === "1";

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
      if (provider === "claude" && imageFiles.length === 0) {
        return res.status(400).json({
          error:
            "Claude could not extract tests because this PDF has no readable text. Please upload images (JPG/PNG) of the report pages or use GPT for scanned PDFs."
        });
      }
      const blood = { data: false, tests: [] };
      const payload = { blood, chunkIndex: 0, totalChunks: 1, chunkSize: 1, hasMore: false };
      if (debugAi) {
        payload.debug = {
          provider,
          extractedTextLength: 0,
          chunkTextLength: 0,
          pdfTextLength: typeof pdfText === "string" ? pdfText.length : 0,
          docxTextLength: typeof docxText === "string" ? docxText.length : 0,
          imageCount: Array.isArray(imageFiles) ? imageFiles.length : 0
        };
      }
      return res.json(payload);
    }

    const { safeIndex, totalChunks, chunkText, chunkSize } = sliceTextFixed(extractedText, chunkIndex, 4);

    const extraction =
      imageFiles.length > 0
        ? await extractAllBloodParametersFromImagesAndText({
          openai,
          imageFiles,
          extractedText: chunkText,
          provider,
          debug: debugAi
        })
        : await extractAllBloodParametersFromText({ openai, extractedText: chunkText, provider, debug: debugAi });

    const incomingTests = Array.isArray(extraction?.tests) ? extraction.tests : [];
    const merged = mergeTestEntries([], incomingTests);
    if (provider === "claude" && merged.length === 0) {
      const raw = typeof extraction?.raw === "string" ? extraction.raw : "";
      const payload = {
        error:
          "Claude returned no parsable tests for this chunk. This usually happens when the response was truncated or not valid JSON. Enable AI_DEBUG=1 to see the response preview, or try the next chunk / use images."
      };
      if (debugAi) {
        payload.debug = {
          provider,
          extractedTextLength: typeof extractedText === "string" ? extractedText.length : 0,
          chunkTextLength: typeof chunkText === "string" ? chunkText.length : 0,
          pdfTextLength: typeof pdfText === "string" ? pdfText.length : 0,
          docxTextLength: typeof docxText === "string" ? docxText.length : 0,
          imageCount: Array.isArray(imageFiles) ? imageFiles.length : 0,
          aiResponsePreview: raw ? raw.slice(0, 2000) : null
        };
      }
      return res.status(502).json(payload);
    }
    const hasAny = merged.length > 0;
    const blood = { data: hasAny, tests: merged };
    const payload = { blood, chunkIndex: safeIndex, totalChunks, chunkSize, hasMore: safeIndex + 1 < totalChunks };
    if (debugAi) {
      const raw = typeof extraction?.raw === "string" ? extraction.raw : "";
      payload.debug = {
        provider,
        extractedTextLength: typeof extractedText === "string" ? extractedText.length : 0,
        chunkTextLength: typeof chunkText === "string" ? chunkText.length : 0,
        pdfTextLength: typeof pdfText === "string" ? pdfText.length : 0,
        docxTextLength: typeof docxText === "string" ? docxText.length : 0,
        imageCount: Array.isArray(imageFiles) ? imageFiles.length : 0,
        extractedTests: merged.length,
        aiResponsePreview: raw ? raw.slice(0, 2000) : null
      };
    }
    res.json(payload);
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
