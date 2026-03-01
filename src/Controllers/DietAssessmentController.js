import { createDietAssessmentClaudeHandler } from "./DietAssessmentClaudeController.js";
import { createDietAssessmentOpenAIHandler } from "./DietAssessmentOpenAIController.js";

export function createDietAssessmentHandler(getContext) {
  const openaiHandler = createDietAssessmentOpenAIHandler(getContext);
  const claudeHandler = createDietAssessmentClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

