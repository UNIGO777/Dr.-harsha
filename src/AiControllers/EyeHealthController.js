import { createEyeHealthClaudeHandler } from "./EyeHealthClaudeController.js";
import { createEyeHealthOpenAIHandler } from "./EyeHealthOpenAIController.js";

export function createEyeHealthHandler(getContext) {
  const openaiHandler = createEyeHealthOpenAIHandler(getContext);
  const claudeHandler = createEyeHealthClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

