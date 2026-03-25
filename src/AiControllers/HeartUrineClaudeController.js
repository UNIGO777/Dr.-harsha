export function createHeartUrineAnalysisClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        collectUploadedFiles,
        isPdfMime,
        isDocxMime,
        isImageMime,
        extractPdfTextRawForPrompt,
        extractDocxTextForPrompt,
        parseMaybeNumber,
        extractHeartRelatedTestsFromPdfs,
        extractUrinogramTestsFromPdfs,
        chunkArray,
        mapWithConcurrency,
        PARAMETER_TESTS_FOR_EXTRACTION,
        extractTestsFromPdfs,
        mergeTestEntries,
        buildCompleteUrinogramTests,
        buildPresentedCategory,
        BLOOD_PARAMETER_TESTS,
        OTHER_PARAMETER_TESTS
      } = getContext();

      if (!hasAnthropicKey()) {
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

      const pdfText = await extractPdfTextRawForPrompt(pdfFiles);
      const docxText = await extractDocxTextForPrompt(docxFiles);
      const extractedText = `${pdfText}${docxText}`;

      const gptConcurrency = parseMaybeNumber(process.env.GPT_CONCURRENCY) ?? 2;

      const heartPromise = extractHeartRelatedTestsFromPdfs({
        openai: null,
        pdfFiles,
        extractedText,
        provider: "claude"
      });

      const urinePromise = extractUrinogramTestsFromPdfs({
        openai: null,
        pdfFiles,
        imageFiles,
        extractedText,
        provider: "claude"
      });

      const chunks = chunkArray(PARAMETER_TESTS_FOR_EXTRACTION, 150);
      const chunkResults = await mapWithConcurrency(chunks, gptConcurrency, async (chunk) => {
        return extractTestsFromPdfs({
          openai: null,
          pdfFiles,
          extractedText,
          testNames: chunk,
          provider: "claude"
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
  };
}

export function createHeartAnalysisClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        collectUploadedFiles,
        isPdfMime,
        extractPdfTextForPrompt,
        extractHeartRelatedTestsFromPdfs
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

      const extractedText = await extractPdfTextForPrompt(pdfFiles);
      const incoming = await extractHeartRelatedTestsFromPdfs({
        openai: null,
        pdfFiles,
        extractedText,
        provider: "claude"
      });

      const heartTests = Array.isArray(incoming) ? incoming : [];
      const heart = { data: heartTests.length > 0, tests: heartTests };
      res.json({ heart });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}

export function createUrineAnalysisClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        collectUploadedFiles,
        isPdfMime,
        isDocxMime,
        isImageMime,
        extractPdfTextForPrompt,
        extractDocxTextForPrompt,
        extractUrinogramTestsFromPdfs,
        buildCompleteUrinogramTests
      } = getContext();

      if (!hasAnthropicKey()) {
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
        openai: null,
        pdfFiles,
        imageFiles,
        extractedText,
        provider: "claude"
      });

      const tests = buildCompleteUrinogramTests(incoming);
      const hasAny = tests.some((t) => t?.status !== "Not included in the PDF");
      const urine = { data: hasAny, tests };
      res.json({ urine, chunkIndex: 0, totalChunks: 1, chunkSize: tests.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
