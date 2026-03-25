export function createDietAssessmentOpenAIHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        getAiProviderFromReq,
        hasGeminiKey,
        normalizeDietAssessmentIncoming,
        computeDietAssessment,
        generateDietAssessmentSummaryWithAi
      } = getContext();

      const provider = getAiProviderFromReq(req);
      const openai = provider === "openai" ? getOpenAIClient() : null;
      if (provider === "openai" && !openai) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      }
      if (provider === "gemini" && !hasGeminiKey()) {
        return res.status(500).json({ error: "Gemini_api_key is not set" });
      }

      const debugAi = process.env.AI_DEBUG === "1";
      const normalized = normalizeDietAssessmentIncoming(req?.body);
      const computed = computeDietAssessment(normalized);

      const ai = await generateDietAssessmentSummaryWithAi({
        openai,
        provider,
        patient: normalized.patient,
        assessment: normalized.assessment,
        computed,
        debug: debugAi
      });

      const payload = {
        patient: normalized.patient,
        assessment: normalized.assessment,
        computed,
        summary: typeof ai?.summary === "string" ? ai.summary : "",
        counselling: typeof ai?.counselling === "string" ? ai.counselling : "",
        keyIssues: Array.isArray(ai?.keyIssues) ? ai.keyIssues : [],
        suggestedActions: Array.isArray(ai?.suggestedActions) ? ai.suggestedActions : []
      };
      if (debugAi && typeof ai?.raw === "string") payload.raw = ai.raw;
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}

