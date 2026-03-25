import { createDiabetesRiskClaudeHandler } from "./DiabetesRiskClaudeController.js";
import { createDiabetesRiskOpenAIHandler } from "./DiabetesRiskOpenAIController.js";

export function createDiabetesRiskHandler(getContext) {
  const openaiHandler = createDiabetesRiskOpenAIHandler(getContext);
  const claudeHandler = createDiabetesRiskClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
