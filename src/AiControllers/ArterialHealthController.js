import { createArterialHealthClaudeHandler } from "./ArterialHealthClaudeController.js";
import { createArterialHealthOpenAIHandler } from "./ArterialHealthOpenAIController.js";

export function createArterialHealthHandler(getContext) {
  const openaiHandler = createArterialHealthOpenAIHandler(getContext);
  const claudeHandler = createArterialHealthClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

