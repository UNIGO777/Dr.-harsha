import { createWomenHealthClaudeHandler } from "./WomenHealthClaudeController.js";
import { createWomenHealthOpenAIHandler } from "./WomenHealthOpenAIController.js";

export function createWomenHealthHandler(getContext) {
  const openaiHandler = createWomenHealthOpenAIHandler(getContext);
  const claudeHandler = createWomenHealthClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

