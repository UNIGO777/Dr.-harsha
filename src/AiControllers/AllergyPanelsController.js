import { createAllergyPanelsClaudeHandler } from "./AllergyPanelsClaudeController.js";
import { createAllergyPanelsOpenAIHandler } from "./AllergyPanelsOpenAIController.js";

export function createAllergyPanelsHandler(getContext) {
  const openaiHandler = createAllergyPanelsOpenAIHandler(getContext);
  const claudeHandler = createAllergyPanelsClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

