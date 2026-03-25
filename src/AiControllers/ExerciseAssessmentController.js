import { createExerciseAssessmentClaudeHandler } from "./ExerciseAssessmentClaudeController.js";
import { createExerciseAssessmentOpenAIHandler } from "./ExerciseAssessmentOpenAIController.js";

export function createExerciseAssessmentHandler(getContext) {
  const openaiHandler = createExerciseAssessmentOpenAIHandler(getContext);
  const claudeHandler = createExerciseAssessmentClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

