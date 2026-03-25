export function createGenesHealthClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getAiProviderFromReq,
        hasAnthropicKey,
        collectUploadedFiles,
        isPdfMime,
        isDocxMime,
        isImageMime,
        extractPdfTextForBloodPrompt,
        extractDocxTextForBloodPrompt,
        normalizeGenesHealthIncoming,
        generateGenesHealthWithAi
      } = getContext();

      const provider = getAiProviderFromReq(req);
      if (provider !== "claude") {
        return res.status(400).json({ error: "Invalid provider for this handler" });
      }
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
        return res.status(400).json({ error: "Only PDF, DOCX, and image files are allowed." });
      }

      const normalized = normalizeGenesHealthIncoming(req?.body);
      const pdfText = await extractPdfTextForBloodPrompt(pdfFiles);
      const docxText = await extractDocxTextForBloodPrompt(docxFiles);
      const extractedText = `${pdfText}${docxText}`;

      const debugAi = process.env.AI_DEBUG === "1";
      const genesHealth = await generateGenesHealthWithAi({
        openai: null,
        provider,
        patient: normalized.patient,
        extractedText,
        imageFiles,
        debug: debugAi
      });

      res.json({ patient: normalized.patient, genesHealth });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}

