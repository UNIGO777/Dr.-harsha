import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Reliable PDF text extraction.
 *
 * `pdf-parse`'s own wrapper throws "bad XRef entry" on the PDFs our medical
 * devices produce (VPT, spirometry), even though the pdf.js build it ships can
 * read them perfectly. So we drive pdf.js directly.
 *
 * These devices also draw every string two or three times at almost the same
 * coordinates to fake a bold/shadow effect, which turns naive extraction into
 * "HOSPITALS HOSPITALSHOSPITALS HOSPITALS". We de-duplicate by position and
 * collapse self-repeating strings so downstream parsers and prompts see clean
 * text.
 *
 * No new dependency: the builds below already ship inside pdf-parse.
 */

const PDFJS_BUILDS = [
  "pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js",
  "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js"
];

let cachedPdfjs;

function loadPdfjs() {
  if (cachedPdfjs !== undefined) return cachedPdfjs;
  for (const path of PDFJS_BUILDS) {
    try {
      cachedPdfjs = require(path);
      return cachedPdfjs;
    } catch {
      // try the next bundled build
    }
  }
  cachedPdfjs = null;
  return cachedPdfjs;
}

/** "HOSPITALSHOSPITALS" -> "HOSPITALS" (the device's doubled draw). */
function collapseSelfRepeat(text) {
  const value = typeof text === "string" ? text : "";
  if (value.length < 4 || value.length % 2 !== 0) return value;
  const half = value.length / 2;
  return value.slice(0, half) === value.slice(half) ? value.slice(0, half) : value;
}

/**
 * Rebuild page text from positioned glyph runs: bucket into lines by Y,
 * order by X, and drop runs that overprint one already kept.
 */
function itemsToText(items) {
  const lines = new Map();

  for (const item of items) {
    const str = typeof item?.str === "string" ? item.str : "";
    if (!str.trim()) continue;
    const x = Number(item?.transform?.[4]) || 0;
    const y = Number(item?.transform?.[5]) || 0;
    // 2pt buckets keep a visual line together without merging adjacent rows
    const lineKey = Math.round(y / 2);
    if (!lines.has(lineKey)) lines.set(lineKey, []);
    lines.get(lineKey).push({ x, y, str: collapseSelfRepeat(str) });
  }

  const orderedLines = [...lines.entries()]
    .sort((a, b) => b[0] - a[0]) // PDF origin is bottom-left: high Y first
    .map(([, runs]) => {
      runs.sort((a, b) => a.x - b.x);

      const kept = [];
      for (const run of runs) {
        // Same text starting at essentially the same spot = a shadow/bold pass
        const isOverprint = kept.some(
          (prev) => Math.abs(prev.x - run.x) < 1.5 && Math.abs(prev.y - run.y) < 1.5 && prev.str === run.str
        );
        if (!isOverprint) kept.push(run);
      }

      let line = "";
      let prevEndX = null;
      for (const run of kept) {
        // Insert a space when there is a visible gap between runs
        if (prevEndX !== null && run.x - prevEndX > 1 && !line.endsWith(" ")) line += " ";
        line += run.str;
        prevEndX = run.x + run.str.length * 2.2; // rough advance estimate
      }
      return line.trim();
    })
    .filter(Boolean);

  return orderedLines.join("\n");
}

/**
 * Extract text from a PDF buffer. Returns "" for image-only PDFs and for
 * documents that cannot be parsed at all — never throws.
 */
export async function extractPdfText(buffer) {
  if (!buffer || !buffer.length) return "";
  const pdfjs = loadPdfjs();
  if (!pdfjs) return "";

  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = itemsToText(Array.isArray(content?.items) ? content.items : []);
      if (pageText.trim()) pages.push(pageText);
    }
    if (typeof doc.destroy === "function") await doc.destroy().catch(() => {});
    return pages.join("\n\n");
  } catch (err) {
    console.warn(`[pdfText] extraction failed: ${err?.message || err}`);
    return "";
  }
}
