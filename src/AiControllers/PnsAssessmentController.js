import { createPnsAssessmentClaudeHandler } from "./PnsAssessmentClaudeController.js";
import { createPnsAssessmentOpenAIHandler } from "./PnsAssessmentOpenAIController.js";

export function createPnsAssessmentHandler(getContext) {
  const openaiHandler = createPnsAssessmentOpenAIHandler(getContext);
  const claudeHandler = createPnsAssessmentClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
