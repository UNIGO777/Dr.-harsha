export function createDietAssessmentClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getAiProviderFromReq,
        hasAnthropicKey,
        normalizeDietAssessmentIncoming,
        computeDietAssessment,
        generateDietAssessmentSummaryWithAi
      } = getContext();

      const provider = getAiProviderFromReq(req);
      if (provider !== "claude") {
        return res.status(400).json({ error: "Invalid provider for this handler" });
      }
      if (!hasAnthropicKey()) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
      }

      const debugAi = process.env.AI_DEBUG === "1";
      const normalized = normalizeDietAssessmentIncoming(req?.body);
      const computed = computeDietAssessment(normalized);

      const ai = await generateDietAssessmentSummaryWithAi({
        openai: null,
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

