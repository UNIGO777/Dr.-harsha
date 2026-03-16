import { createBrainHealthAssessmentClaudeHandler } from "./BrainHealthAssessmentClaudeController.js";
import { createBrainHealthAssessmentOpenAIHandler } from "./BrainHealthAssessmentOpenAIController.js";

export function createBrainHealthAssessmentHandler(getContext) {
  const openaiHandler = createBrainHealthAssessmentOpenAIHandler(getContext);
  const claudeHandler = createBrainHealthAssessmentClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

