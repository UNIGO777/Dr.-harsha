export function createExerciseAssessmentClaudeHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getAiProviderFromReq,
        hasAnthropicKey,
        normalizeExerciseAssessmentIncoming,
        computeExerciseAssessment,
        generateExerciseAssessmentSummaryWithAi
      } = getContext();

      const provider = getAiProviderFromReq(req);
      if (provider !== "claude") {
        return res.status(400).json({ error: "Invalid provider for this handler" });
      }
      if (!hasAnthropicKey()) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
      }

      const debugAi = process.env.AI_DEBUG === "1";
      const normalized = normalizeExerciseAssessmentIncoming(req?.body);
      const computed = computeExerciseAssessment(normalized);

      const ai = await generateExerciseAssessmentSummaryWithAi({
        openai: null,
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

