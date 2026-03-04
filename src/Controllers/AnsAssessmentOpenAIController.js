export function createAnsAssessmentOpenAIHandler(getContext) {
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
        normalizeAnsAssessmentIncoming,
        computeOrthostaticVitals,
        generateAnsAssessmentWithAi
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

      const normalized = normalizeAnsAssessmentIncoming(req?.body);
      const computed = computeOrthostaticVitals(normalized.orthostatic);

      const pdfText = await extractPdfTextForBloodPrompt(pdfFiles);
      const docxText = await extractDocxTextForBloodPrompt(docxFiles);
      const extractedText = `${pdfText}${docxText}`;

      const debugAi = process.env.AI_DEBUG === "1";
      const ai = await generateAnsAssessmentWithAi({
        openai,
        provider,
        patient: normalized.patient,
        orthostatic: normalized.orthostatic,
        computed,
        extractedText,
        imageFiles,
        debug: debugAi
      });

      const hasAnyManualOrthostatic =
        Number.isFinite(normalized?.orthostatic?.lying?.sbp) ||
        Number.isFinite(normalized?.orthostatic?.lying?.dbp) ||
        Number.isFinite(normalized?.orthostatic?.lying?.hr) ||
        Number.isFinite(normalized?.orthostatic?.stand1?.sbp) ||
        Number.isFinite(normalized?.orthostatic?.stand1?.dbp) ||
        Number.isFinite(normalized?.orthostatic?.stand1?.hr) ||
        Number.isFinite(normalized?.orthostatic?.stand3?.sbp) ||
        Number.isFinite(normalized?.orthostatic?.stand3?.dbp) ||
        Number.isFinite(normalized?.orthostatic?.stand3?.hr);

      const extractedMeasurements = ai?.orthostatic?.measurements;
      const computedFromReport = computeOrthostaticVitals(extractedMeasurements);
      const computedEffective = hasAnyManualOrthostatic ? computed : computedFromReport;

      const payload = {
        patient: normalized.patient,
        orthostatic: normalized.orthostatic,
        computed: computedEffective,
        computedFromReport,
        ans: ai
      };
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
