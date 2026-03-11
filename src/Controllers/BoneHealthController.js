import { createBoneHealthClaudeHandler } from "./BoneHealthClaudeController.js";
import { createBoneHealthOpenAIHandler } from "./BoneHealthOpenAIController.js";

export function createBoneHealthHandler(getContext) {
  const openaiHandler = createBoneHealthOpenAIHandler(getContext);
  const claudeHandler = createBoneHealthClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}
