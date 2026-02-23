export function createBloodAnalysisClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        collectUploadedFiles,
        isPdfMime,
        isDocxMime,
        isImageMime,
        getChunkParams,
        extractPdfTextForBloodPrompt,
        extractDocxTextForBloodPrompt,
        requireString,
        sliceTextFixed,
        extractAllBloodParametersFromImagesAndText,
        extractAllBloodParametersFromText,
        mergeTestEntries
      } = getContext();

      if (!hasAnthropicKey()) {
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
        if (imageFiles.length === 0) {
          return res.status(400).json({
            error:
              "Claude could not extract tests because this PDF has no readable text. Please upload images (JPG/PNG) of the report pages or use GPT for scanned PDFs."
          });
        }
        const blood = { data: false, tests: [] };
        const payload = { blood, chunkIndex: 0, totalChunks: 1, chunkSize: 1, hasMore: false };
        if (debugAi) {
          payload.debug = {
            provider: "claude",
            extractedTextLength: 0,
            chunkTextLength: 0,
            pdfTextLength: typeof pdfText === "string" ? pdfText.length : 0,
            docxTextLength: typeof docxText === "string" ? docxText.length : 0,
            imageCount: Array.isArray(imageFiles) ? imageFiles.length : 0
          };
        }
        return res.json(payload);
      }

      const { safeIndex, totalChunks, chunkText, chunkSize } = sliceTextFixed(
        extractedText,
        chunkIndex,
        4
      );

      const extraction =
        imageFiles.length > 0
          ? await extractAllBloodParametersFromImagesAndText({
              openai: null,
              imageFiles,
              extractedText: chunkText,
              provider: "claude",
              debug: debugAi
            })
          : await extractAllBloodParametersFromText({
              openai: null,
              extractedText: chunkText,
              provider: "claude",
              debug: debugAi
            });

      const incomingTests = Array.isArray(extraction?.tests) ? extraction.tests : [];
      const merged = mergeTestEntries([], incomingTests);
      if (merged.length === 0) {
        const raw = typeof extraction?.raw === "string" ? extraction.raw : "";
        const payload = {
          error:
            "Claude returned no parsable tests for this chunk. This usually happens when the response was truncated or not valid JSON. Enable AI_DEBUG=1 to see the response preview, or try the next chunk / use images."
        };
        if (debugAi) {
          payload.debug = {
            provider: "claude",
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
      const payload = {
        blood,
        chunkIndex: safeIndex,
        totalChunks,
        chunkSize,
        hasMore: safeIndex + 1 < totalChunks
      };
      if (debugAi) {
        const raw = typeof extraction?.raw === "string" ? extraction.raw : "";
        payload.debug = {
          provider: "claude",
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
  };
}

export function createOtherAnalysisClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        collectUploadedFiles,
        isPdfMime,
        getChunkParams,
        sliceChunkFixed,
        OTHER_ANALYSIS_EXTRACT_TESTS,
        extractPdfTextForPrompt,
        extractTestsFromPdfs,
        buildStrictCategory
      } = getContext();

      if (!hasAnthropicKey()) {
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
        openai: null,
        pdfFiles,
        extractedText,
        testNames: chunk,
        provider: "claude"
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
  };
}
