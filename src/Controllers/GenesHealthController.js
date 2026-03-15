import { createGenesHealthClaudeHandler } from "./GenesHealthClaudeController.js";
import { createGenesHealthOpenAIHandler } from "./GenesHealthOpenAIController.js";

export function createGenesHealthHandler(getContext) {
  const openaiHandler = createGenesHealthOpenAIHandler(getContext);
  const claudeHandler = createGenesHealthClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

