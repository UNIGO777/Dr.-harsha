import { createLiverHealthClaudeHandler } from "./LiverHealthClaudeController.js";
import { createLiverHealthOpenAIHandler } from "./LiverHealthOpenAIController.js";

export function createLiverHealthHandler(getContext) {
  const openaiHandler = createLiverHealthOpenAIHandler(getContext);
  const claudeHandler = createLiverHealthClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

