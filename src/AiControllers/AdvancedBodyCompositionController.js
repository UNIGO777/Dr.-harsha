import { createAdvancedBodyCompositionClaudeHandler } from "./AdvancedBodyCompositionClaudeController.js";
import { createAdvancedBodyCompositionOpenAIHandler } from "./AdvancedBodyCompositionOpenAIController.js";

export function createAdvancedBodyCompositionHandler(getContext) {
  const openaiHandler = createAdvancedBodyCompositionOpenAIHandler(getContext);
  const claudeHandler = createAdvancedBodyCompositionClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
