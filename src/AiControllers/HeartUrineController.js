import {
  createHeartAnalysisClaudeHandler,
  createHeartUrineAnalysisClaudeHandler,
  createUrineAnalysisClaudeHandler
} from "./HeartUrineClaudeController.js";
import {
  createHeartAnalysisOpenAIHandler,
  createHeartUrineAnalysisOpenAIHandler,
  createUrineAnalysisOpenAIHandler
} from "./HeartUrineOpenAIController.js";

export function createHeartUrineAnalysisHandler(getContext) {
  const openaiHandler = createHeartUrineAnalysisOpenAIHandler(getContext);
  const claudeHandler = createHeartUrineAnalysisClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

export function createHeartAnalysisHandler(getContext) {
  const openaiHandler = createHeartAnalysisOpenAIHandler(getContext);
  const claudeHandler = createHeartAnalysisClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

export function createUrineAnalysisHandler(getContext) {
  const openaiHandler = createUrineAnalysisOpenAIHandler(getContext);
  const claudeHandler = createUrineAnalysisClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
