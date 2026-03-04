import { createAnsAssessmentClaudeHandler } from "./AnsAssessmentClaudeController.js";
import { createAnsAssessmentOpenAIHandler } from "./AnsAssessmentOpenAIController.js";

export function createAnsAssessmentHandler(getContext) {
  const openaiHandler = createAnsAssessmentOpenAIHandler(getContext);
  const claudeHandler = createAnsAssessmentClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

