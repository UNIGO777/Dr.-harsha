export function createDocsTestsClaudeHandler(getContext) {
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
        estimateTotalTestsInReportText,
        requireString,
        sliceTextFixedWithOverlap,
        splitTextWindows,
        extractDocsTestsFromImagesAndText,
        extractDocsTestsFromText,
        mergeTestEntries,
        isMissingDocsTestsField,
        filterDocsTestsToMedicalOnly,
        heuristicExtractDocsTestsFromText
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

      const estimatedTotalTestsInReport = estimateTotalTestsInReportText(extractedText);

      if (!requireString(extractedText) && imageFiles.length === 0) {
        return res.status(400).json({
          error:
            "Claude could not extract tests because this PDF has no readable text. Please upload images (JPG/PNG) of the report pages or use GPT for scanned PDFs."
        });
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
          openai: null,
          imageFiles,
          extractedText: chunkText,
          provider: "claude",
          debug: debugAi
        });
        lastRaw = typeof extraction?.raw === "string" ? extraction.raw : "";
        const incomingTests = Array.isArray(extraction?.tests) ? extraction.tests : [];
        aiIncoming.push(...incomingTests);
      } else if (windows.length > 0) {
        for (const w of windows) {
          const extraction = await extractDocsTestsFromText({
            openai: null,
            extractedText: w,
            provider: "claude",
            debug: debugAi
          });
          lastRaw = typeof extraction?.raw === "string" ? extraction.raw : lastRaw;
          const incomingTests = Array.isArray(extraction?.tests) ? extraction.tests : [];
          aiIncoming.push(...incomingTests);
        }
      }

      const heuristicTests = heuristicExtractDocsTestsFromText(chunkText);
      const merged = mergeTestEntries(aiIncoming, heuristicTests);
      const chunkTests = merged.filter((t) => {
        const hasValue = !isMissingDocsTestsField(t?.value);
        const hasResult =
          Array.isArray(t?.results) && t.results.some((r) => !isMissingDocsTestsField(r?.value));
        return hasValue || hasResult;
      });
      const filteredChunkTests = filterDocsTestsToMedicalOnly(chunkTests);

      if (filteredChunkTests.length === 0) {
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
          provider: "claude",
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
  };
}

export function createDocsTestsCleanClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        hasAnthropicKey,
        requireString,
        safeParseJsonObject,
        safeParseJsonArrayLoose,
        normalizeLooseIncomingTests,
        cleanDocsTestsWithAi
      } = getContext();

      if (!hasAnthropicKey()) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
      }

      const raw = req?.body?.testsJson;
      if (!requireString(raw)) {
        return res.status(400).json({ error: "testsJson is required" });
      }

      const debugAi = process.env.AI_DEBUG === "1";
      const parsedObject = safeParseJsonObject(raw);
      const parsedArray = parsedObject ? null : safeParseJsonArrayLoose(raw);
      const normalized = Array.isArray(parsedArray)
        ? normalizeLooseIncomingTests({ tests: parsedArray })
        : normalizeLooseIncomingTests(parsedObject ?? {});

      const cleaned = await cleanDocsTestsWithAi({
        openai: null,
        provider: "claude",
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
  };
}
