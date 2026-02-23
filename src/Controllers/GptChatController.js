import { createGptChatClaudeHandler } from "./GptChatClaudeController.js";
import { createGptChatOpenAIHandler } from "./GptChatOpenAIController.js";

export function createGptChatHandler(getContext) {
  const openaiHandler = createGptChatOpenAIHandler(getContext);
  const claudeHandler = createGptChatClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
