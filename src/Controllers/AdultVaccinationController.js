import { createAdultVaccinationClaudeHandler } from "./AdultVaccinationClaudeController.js";
import { createAdultVaccinationOpenAIHandler } from "./AdultVaccinationOpenAIController.js";

export function createAdultVaccinationHandler(getContext) {
  const openaiHandler = createAdultVaccinationOpenAIHandler(getContext);
  const claudeHandler = createAdultVaccinationClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

