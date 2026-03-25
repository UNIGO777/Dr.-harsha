import { createLungFunctionClaudeHandler } from "./LungFunctionClaudeController.js";
import { createLungFunctionOpenAIHandler } from "./LungFunctionOpenAIController.js";

export function createLungFunctionHandler(getContext) {
  const openaiHandler = createLungFunctionOpenAIHandler(getContext);
  const claudeHandler = createLungFunctionClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

