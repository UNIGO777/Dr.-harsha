export function createBoneHealthFindingsHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        getAiProviderFromReq,
        hasGeminiKey,
        normalizeBoneHealthFindingsIncoming,
        generateBoneHealthFindingsWithAi
      } = getContext();

      const provider = getAiProviderFromReq(req);
      const openai = provider === "openai" ? getOpenAIClient() : null;
      if (provider === "openai" && !openai) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      }
      if (provider === "gemini" && !hasGeminiKey()) {
        return res.status(500).json({ error: "Gemini_api_key is not set" });
      }

      const normalized = normalizeBoneHealthFindingsIncoming(req.body);
      const debugAi = process.env.AI_DEBUG === "1";

      const findings = await generateBoneHealthFindingsWithAi({
        openai,
        provider,
        patient: normalized.patient,
        assessment: normalized.assessment,
        debug: debugAi
      });

      res.json({ patient: normalized.patient, findings });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
