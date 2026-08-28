import pdfParse from "pdf-parse";

/**
 * Sending scanned PDFs to the AI.
 *
 * `pdf-parse` only reads a PDF's TEXT LAYER. Reports that come off a machine as
 * a scan (spirometry printouts, photographed lab sheets) have no text layer, so
 * extraction returns "" and the model is asked to fill a clinical table from
 * nothing — which is how a report ends up showing FEV1 = 0.
 *
 * These helpers detect that case and hand the PDF itself to the model, which
 * every provider we use can read natively. When even that is impossible we
 * raise a clear error instead of letting zeros reach a clinical report.
 */

/** Providers reject very large inline documents; skip anything past this. */
export const AI_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * A real report always yields a few hundred characters. A handful of stray
 * glyphs (page numbers, a stamped header) means the body is an image.
 */
const MIN_USABLE_TEXT_CHARS = 120;

export function hasUsableTextLayer(text, { minChars = MIN_USABLE_TEXT_CHARS } = {}) {
  if (typeof text !== "string") return false;
  return text.replace(/\s+/g, "").length >= minChars;
}

/**
 * Split PDFs into the ones whose text was already extracted and the ones that
 * are effectively images and must be sent to the model as documents.
 */
export async function findScannedPdfs(pdfFiles) {
  const files = Array.isArray(pdfFiles) ? pdfFiles : [];
  const scanned = [];

  for (const file of files) {
    if (!file?.buffer) continue;
    if (file.buffer.length > AI_DOCUMENT_MAX_BYTES) continue;
    let text = "";
    try {
      const parsed = await pdfParse(file.buffer);
      text = typeof parsed?.text === "string" ? parsed.text : "";
    } catch {
      // Unparseable PDF — still worth showing to the model as a document
      text = "";
    }
    if (!hasUsableTextLayer(text)) scanned.push(file);
  }

  return scanned;
}

function toBase64(file) {
  return file.buffer.toString("base64");
}

/**
 * Build provider-shaped content parts for images and PDF documents.
 * `provider` is the already-normalised "gemini" | "claude" | "openai".
 */
export function buildFileParts({ provider, imageFiles = [], documentFiles = [] }) {
  const images = Array.isArray(imageFiles) ? imageFiles : [];
  const documents = (Array.isArray(documentFiles) ? documentFiles : []).filter(
    (f) => f?.buffer && f.buffer.length <= AI_DOCUMENT_MAX_BYTES
  );
  const parts = [];

  if (provider === "gemini") {
    for (const f of images) parts.push({ inlineData: { mimeType: f.mimetype, data: toBase64(f) } });
    for (const f of documents) parts.push({ inlineData: { mimeType: "application/pdf", data: toBase64(f) } });
    return parts;
  }

  if (provider === "claude") {
    for (const f of images) {
      parts.push({ type: "image", source: { type: "base64", media_type: f.mimetype, data: toBase64(f) } });
    }
    for (const f of documents) {
      parts.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: toBase64(f) }
      });
    }
    return parts;
  }

  // OpenAI chat completions
  for (const f of images) {
    parts.push({ type: "image_url", image_url: { url: `data:${f.mimetype};base64,${toBase64(f)}` } });
  }
  for (const f of documents) {
    parts.push({
      type: "file",
      file: {
        filename: f.originalname || "report.pdf",
        file_data: `data:application/pdf;base64,${toBase64(f)}`
      }
    });
  }
  return parts;
}

/**
 * Refuse to run the model when there is genuinely nothing to read.
 * Silently returning an empty/zeroed clinical table is far worse than an error
 * the nurse can act on.
 */
export function assertAiInputReadable({ extractedText, imageFiles = [], documentFiles = [], pdfFiles = [], label = "report" }) {
  const hasText = hasUsableTextLayer(extractedText, { minChars: 1 });
  const hasImages = (Array.isArray(imageFiles) ? imageFiles : []).length > 0;
  const hasDocuments = (Array.isArray(documentFiles) ? documentFiles : []).length > 0;
  if (hasText || hasImages || hasDocuments) return;

  const uploadedPdfs = Array.isArray(pdfFiles) ? pdfFiles : [];
  const oversized = uploadedPdfs.filter((f) => f?.buffer && f.buffer.length > AI_DOCUMENT_MAX_BYTES);

  if (oversized.length > 0) {
    const names = oversized.map((f) => f.originalname || "file").join(", ");
    throw new Error(
      `The uploaded ${label} is too large to read (${names}). Please upload a file under 20 MB, or a photo/screenshot of the report pages.`
    );
  }

  if (uploadedPdfs.length > 0) {
    throw new Error(
      `Could not read any text from the uploaded ${label}. It looks like a scanned PDF. Please re-upload it as an image (JPG/PNG) of each page, or enter the values manually.`
    );
  }

  throw new Error(`No ${label} was uploaded, so there is nothing to extract. Upload the report or enter the values manually.`);
}

/**
 * Prepare uploaded files for a generator: works out which PDFs need to travel
 * as documents and fails loudly when nothing is readable.
 */
export async function prepareAiFileInputs({ extractedText, pdfFiles, imageFiles, label }) {
  const documentFiles = await findScannedPdfs(pdfFiles);
  assertAiInputReadable({ extractedText, imageFiles, documentFiles, pdfFiles, label });
  return { documentFiles };
}
