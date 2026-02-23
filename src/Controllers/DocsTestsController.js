import { createDocsTestsClaudeHandler, createDocsTestsCleanClaudeHandler } from "./DocsTestsClaudeController.js";
import { createDocsTestsOpenAIHandler, createDocsTestsCleanOpenAIHandler } from "./DocsTestsOpenAIController.js";

export function createDocsTestsHandler(getContext) {
  const openaiHandler = createDocsTestsOpenAIHandler(getContext);
  const claudeHandler = createDocsTestsClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

export function createDocsTestsCleanHandler(getContext) {
  const openaiHandler = createDocsTestsCleanOpenAIHandler(getContext);
  const claudeHandler = createDocsTestsCleanClaudeHandler(getContext);
  return async (req, res) => {
    const { getAiProviderFromReq } = getContext();
    const provider = getAiProviderFromReq(req);
    if (provider === "claude") return claudeHandler(req, res);
    return openaiHandler(req, res);
  };
}

export function createDocsTestsExcelHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        requireString,
        safeParseJsonObject,
        safeParseJsonArrayLoose,
        normalizeLooseIncomingTests,
        toNullOrString,
        canonicalizeTestName,
        PARAMETER_TESTS_PREFERRED,
        buildDocsTestsExcelBuffer
      } = getContext();

      const raw = req?.body?.testsJson;
      if (!requireString(raw)) {
        return res.status(400).json({ error: "testsJson is required" });
      }

      const parsedObject = safeParseJsonObject(raw);
      const parsedArray = parsedObject ? null : safeParseJsonArrayLoose(raw);
      const normalized = Array.isArray(parsedArray)
        ? normalizeLooseIncomingTests({ tests: parsedArray })
        : normalizeLooseIncomingTests(parsedObject ?? {});

      const standardized = normalized.map((t) => {
        const name = toNullOrString(t?.testName);
        if (!name) return t;
        const key = canonicalizeTestName(name);
        const preferred = key ? PARAMETER_TESTS_PREFERRED.get(key) : null;
        return { ...t, testName: preferred ?? name };
      });
      const buffer = await buildDocsTestsExcelBuffer(standardized);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", 'attachment; filename="docs-tests.xlsx"');
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
