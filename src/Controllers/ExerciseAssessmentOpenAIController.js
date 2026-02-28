export function createExerciseAssessmentOpenAIHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        getAiProviderFromReq,
        hasGeminiKey,
        normalizeExerciseAssessmentIncoming,
        computeExerciseAssessment,
        generateExerciseAssessmentSummaryWithAi
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
      const normalized = normalizeExerciseAssessmentIncoming(req?.body);
      const computed = computeExerciseAssessment(normalized);

      const ai = await generateExerciseAssessmentSummaryWithAi({
        openai,
        provider,
        patient: normalized.patient,
        assessment: normalized.assessment,
        computed,
        debug: debugAi
      });

      const mergedFlags = [
        ...new Set([
          ...(Array.isArray(computed?.safetyFlags) ? computed.safetyFlags : []),
          ...(Array.isArray(ai?.safetyFlags) ? ai.safetyFlags : [])
        ])
      ];

      const payload = {
        patient: normalized.patient,
        assessment: normalized.assessment,
        computed: { ...computed, safetyFlags: mergedFlags },
        summary: typeof ai?.summary === "string" ? ai.summary : "",
        counselling: typeof ai?.counselling === "string" ? ai.counselling : ""
      };
      if (debugAi && typeof ai?.raw === "string") payload.raw = ai.raw;
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}

