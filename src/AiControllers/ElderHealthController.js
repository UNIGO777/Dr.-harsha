export function createElderHealthHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        getAiProviderFromReq,
        hasGeminiKey,
        collectUploadedFiles,
        isPdfMime,
        isDocxMime,
        isImageMime,
        extractPdfTextForBloodPrompt,
        extractDocxTextForBloodPrompt,
        normalizeElderHealthIncoming,
        generateElderHealthWithAi,
      } = getContext();

      const provider = getAiProviderFromReq(req);
      const openai = provider === "openai" ? getOpenAIClient() : null;
      if (provider === "openai" && !openai) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      }
      if (provider === "gemini" && !hasGeminiKey()) {
        return res.status(500).json({ error: "Gemini_api_key is not set" });
      }

      const uploaded = collectUploadedFiles(req);
      if (uploaded.length === 0) {
        return res.status(400).json({ error: "Please upload at least one elder health document." });
      }

      const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
      const docxFiles = uploaded.filter((f) => isDocxMime(f?.mimetype));
      const imageFiles = uploaded.filter((f) => isImageMime(f?.mimetype));
      const unsupported = uploaded.filter(
        (f) => !isPdfMime(f?.mimetype) && !isDocxMime(f?.mimetype) && !isImageMime(f?.mimetype)
      );
      if (unsupported.length > 0) {
        return res.status(400).json({ error: "Only PDF, DOCX, and image files are allowed." });
      }

      const normalized = normalizeElderHealthIncoming(req?.body);
      const pdfText = await extractPdfTextForBloodPrompt(pdfFiles);
      const docxText = await extractDocxTextForBloodPrompt(docxFiles);
      const extractedText = `${pdfText}${docxText}`;

      const result = await generateElderHealthWithAi({
        openai,
        provider,
        patient: normalized.patient,
        extractedText,
        imageFiles,
        debug: process.env.AI_DEBUG === "1",
      });

      res.json({ patient: normalized.patient, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
