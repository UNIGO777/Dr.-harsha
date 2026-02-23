import { createBloodAnalysisClaudeHandler, createOtherAnalysisClaudeHandler } from "./BloodOtherClaudeController.js";
import { createBloodAnalysisOpenAIHandler, createOtherAnalysisOpenAIHandler } from "./BloodOtherOpenAIController.js";

export function createBloodAnalysisHandler(getContext) {
  const openaiHandler = createBloodAnalysisOpenAIHandler(getContext);
  const claudeHandler = createBloodAnalysisClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

export function createOtherAnalysisHandler(getContext) {
  const openaiHandler = createOtherAnalysisOpenAIHandler(getContext);
  const claudeHandler = createOtherAnalysisClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
