import { createUltrasoundAnalysisClaudeHandler } from "./UltrasoundClaudeController.js";
import { createUltrasoundAnalysisOpenAIHandler } from "./UltrasoundOpenAIController.js";

export function createUltrasoundAnalysisHandler(getContext) {
  const openaiHandler = createUltrasoundAnalysisOpenAIHandler(getContext);
  const claudeHandler = createUltrasoundAnalysisClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
