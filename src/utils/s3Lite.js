import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

/**
 * Minimal S3-compatible client (AWS Signature V4) with zero dependencies.
 * Works with AWS S3, Cloudflare R2 and Backblaze B2's S3 endpoint.
 * Path-style requests only — pass the account/regional endpoint, e.g.
 *   https://s3.ap-south-1.amazonaws.com
 *   https://<accountid>.r2.cloudflarestorage.com
 *   https://s3.us-west-004.backblazeb2.com
 */

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** RFC 3986 encode, keeping "/" for paths. */
function awsUriEncode(value, keepSlash) {
  let out = "";
  for (const char of value) {
    if (/[A-Za-z0-9\-._~]/.test(char) || (keepSlash && char === "/")) {
      out += char;
    } else {
      for (const byte of Buffer.from(char, "utf8")) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

export function createS3Client({ endpoint, region, bucket, accessKey, secretKey }) {
  if (!endpoint || !region || !bucket || !accessKey || !secretKey) {
    throw new Error("s3Lite: endpoint, region, bucket, accessKey and secretKey are all required");
  }
  const base = new URL(endpoint);

  async function request({ method, key = "", query = {}, body = null, contentType = "" }) {
    const payload = body === null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const payloadHash = sha256Hex(payload);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const canonicalPath = awsUriEncode(`/${bucket}${key ? `/${key}` : ""}`, true);
    const sortedQuery = Object.keys(query)
      .sort()
      .map((name) => `${awsUriEncode(name, false)}=${awsUriEncode(String(query[name]), false)}`)
      .join("&");

    const headers = {
      host: base.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    };
    if (contentType) headers["content-type"] = contentType;

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${String(headers[name]).trim()}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");

    const canonicalRequest = [method, canonicalPath, sortedQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

    const kDate = hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    headers["content-length"] = payload.length;

    const requestUrl = `${base.origin}${canonicalPath}${sortedQuery ? `?${sortedQuery}` : ""}`;

    return new Promise((resolve, reject) => {
      const lib = base.protocol === "http:" ? http : https;
      const req = lib.request(requestUrl, { method, headers, timeout: 120_000 }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
        });
      });
      req.on("timeout", () => req.destroy(new Error("S3 request timed out")));
      req.on("error", reject);
      if (payload.length > 0) req.write(payload);
      req.end();
    });
  }

  return {
    async putObject(key, body, contentType = "application/octet-stream") {
      const res = await request({ method: "PUT", key, body, contentType });
      if (res.status !== 200) {
        throw new Error(`S3 PUT ${key} failed: HTTP ${res.status} ${res.body.toString().slice(0, 300)}`);
      }
    },

    /** Returns true if the object exists. */
    async headObject(key) {
      const res = await request({ method: "HEAD", key });
      if (res.status === 200) return true;
      if (res.status === 404) return false;
      throw new Error(`S3 HEAD ${key} failed: HTTP ${res.status}`);
    },

    async getObject(key) {
      const res = await request({ method: "GET", key });
      if (res.status !== 200) {
        throw new Error(`S3 GET ${key} failed: HTTP ${res.status} ${res.body.toString().slice(0, 300)}`);
      }
      return res.body;
    },

    async deleteObject(key) {
      const res = await request({ method: "DELETE", key });
      if (res.status !== 204 && res.status !== 200) {
        throw new Error(`S3 DELETE ${key} failed: HTTP ${res.status}`);
      }
    },

    /** List keys under a prefix (single page, up to 1000). Returns [{key, size, lastModified}]. */
    async listObjects(prefix) {
      const res = await request({ method: "GET", query: { "list-type": "2", prefix, "max-keys": "1000" } });
      if (res.status !== 200) {
        throw new Error(`S3 LIST ${prefix} failed: HTTP ${res.status} ${res.body.toString().slice(0, 300)}`);
      }
      const xml = res.body.toString();
      const objects = [];
      const contentBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
      for (const block of contentBlocks) {
        const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] || "";
        const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] || 0);
        const lastModified = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] || "";
        if (key) objects.push({ key, size, lastModified });
      }
      return objects;
    }
  };
}
