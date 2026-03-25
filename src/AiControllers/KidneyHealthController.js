import { createKidneyHealthClaudeHandler } from "./KidneyHealthClaudeController.js";
import { createKidneyHealthOpenAIHandler } from "./KidneyHealthOpenAIController.js";

export function createKidneyHealthHandler(getContext) {
  const openaiHandler = createKidneyHealthOpenAIHandler(getContext);
  const claudeHandler = createKidneyHealthClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
