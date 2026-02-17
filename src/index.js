import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { gptRouter } from "./routes/gpt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

function safePreview(value, maxChars = 4000) {
  try {
    const text =
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : value == null
            ? ""
            : JSON.stringify(value);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}…(truncated)`;
  } catch {
    const text = String(value);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}…(truncated)`;
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err);
});

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
  const startedAt = Date.now();
  res.setHeader("x-request-id", requestId);

  const method = req.method;
  const url = req.originalUrl || req.url;

  let responseBody;
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.send = (body) => {
    if (responseBody === undefined) responseBody = body;
    return originalSend(body);
  };

  console.log(`[${requestId}] -> ${method} ${url}`);

  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    const status = res.statusCode;
    const line = `[${requestId}] <- ${method} ${url} ${status} ${ms}ms`;

    if (status >= 400) {
      console.error(line);
      if (responseBody !== undefined) {
        console.error(`[${requestId}] response: ${safePreview(responseBody)}`);
      }
    } else {
      console.log(line);
    }
  });

  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api", gptRouter);

app.use((err, req, res, next) => {
  const requestId = res.getHeader("x-request-id") || "unknown";
  console.error(`[${requestId}] handler error:`, err);
  if (res.headersSent) return next(err);

  if (err && typeof err === "object") {
    const name = typeof err.name === "string" ? err.name : "";
    const code = typeof err.code === "string" ? err.code : "";
    if (name === "MulterError") {
      if (code === "LIMIT_FILE_SIZE") {
        const maxMb = process.env.MAX_UPLOAD_MB || "15";
        return res.status(413).json({ error: `File too large. Max allowed is ${maxMb}MB.` });
      }
      if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ error: "Too many files uploaded." });
      }
      return res.status(400).json({ error: "Invalid upload." });
    }

    if (code === "entity.too.large") {
      return res.status(413).json({ error: "Request body too large." });
    }
  }

  res.status(500).json({ error: err instanceof Error ? err.message : "Internal Server Error" });
});

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${port}`);
});

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
server.setTimeout(REQUEST_TIMEOUT_MS);
server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = REQUEST_TIMEOUT_MS + 10 * 1000;
