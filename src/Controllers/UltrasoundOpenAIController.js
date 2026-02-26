export function createUltrasoundAnalysisOpenAIHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        collectUploadedFiles,
        isPdfMime,
        isDocxMime,
        isImageMime,
        extractPdfTextForPrompt,
        extractDocxTextForPrompt,
        extractUltrasoundFindingsFromPdfs
      } = getContext();

      const openai = getOpenAIClient();
      if (!openai) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      }

      const uploaded = collectUploadedFiles(req);
      const pdfFiles = uploaded.filter((f) => isPdfMime(f?.mimetype));
      const docxFiles = uploaded.filter((f) => isDocxMime(f?.mimetype));
      const imageFiles = uploaded.filter((f) => isImageMime(f?.mimetype));
      const unsupportedFiles = uploaded.filter(
        (f) => !isPdfMime(f?.mimetype) && !isDocxMime(f?.mimetype) && !isImageMime(f?.mimetype)
      );
      if (unsupportedFiles.length > 0) {
        return res.status(400).json({
          error: "Only PDF, DOCX, and image files are allowed."
        });
      }
      if (pdfFiles.length + docxFiles.length + imageFiles.length === 0) {
        return res.status(400).json({ error: "Upload file(s) as field name 'files'." });
      }

      const pdfText = await extractPdfTextForPrompt(pdfFiles);
      const docxText = await extractDocxTextForPrompt(docxFiles);
      const extractedText = `${pdfText}${docxText}`;

      const findings = await extractUltrasoundFindingsFromPdfs({
        openai,
        pdfFiles,
        imageFiles,
        extractedText,
        provider: "openai"
      });

      const f = findings && typeof findings === "object" ? findings : {};
      const hasAny =
        Object.values(f).some((v) => v && typeof v === "object" && v.status && v.status !== "Not included in the PDF") ||
        (Array.isArray(f.otherFindings) && f.otherFindings.length > 0);

      res.json({ ultrasound: { data: hasAny, findings: f } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
