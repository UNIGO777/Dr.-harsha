export function createBrainHealthAssessmentOpenAIHandler(getContext) {
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
        normalizeBrainHealthAssessmentIncoming,
        generateBrainHealthAssessmentWithAi
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
      const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
      const docxFiles = uploaded.filter((f) => isDocxMime(f?.mimetype));
      const imageFiles = uploaded.filter((f) => isImageMime(f?.mimetype));
      const unsupportedFiles = uploaded.filter(
        (f) => !isPdfMime(f?.mimetype) && !isDocxMime(f?.mimetype) && !isImageMime(f?.mimetype)
      );
      if (unsupportedFiles.length > 0) {
        return res.status(400).json({ error: "Only PDF, DOCX, and image files are allowed." });
      }

      const normalized = normalizeBrainHealthAssessmentIncoming(req?.body);
      const pdfText = await extractPdfTextForBloodPrompt(pdfFiles);
      const docxText = await extractDocxTextForBloodPrompt(docxFiles);
      const extractedText = `${pdfText}${docxText}`;

      const debugAi = process.env.AI_DEBUG === "1";
      const brainHealthAssessment = await generateBrainHealthAssessmentWithAi({
        openai,
        provider,
        patient: normalized.patient,
        extractedText,
        imageFiles,
        debug: debugAi
      });

      res.json({ patient: normalized.patient, brainHealthAssessment });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}

