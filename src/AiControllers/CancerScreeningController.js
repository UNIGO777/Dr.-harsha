import { createCancerScreeningClaudeHandler } from "./CancerScreeningClaudeController.js";
import { createCancerScreeningOpenAIHandler } from "./CancerScreeningOpenAIController.js";

export function createCancerScreeningHandler(getContext) {
  const openaiHandler = createCancerScreeningOpenAIHandler(getContext);
  const claudeHandler = createCancerScreeningClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

