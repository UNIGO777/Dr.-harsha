export function createUltrasoundAnalysisOpenAIHandler(getContext) {
  return async (req, res) => {
    try {
      const {
        getOpenAIClient,
        getAiProviderFromReq,
        collectUploadedFiles,
        isPdfMime,
        isDocxMime,
        isImageMime,
        extractPdfTextForPrompt,
        extractDocxTextForPrompt,
        extractUltrasoundFindingsFromPdfs
      } = getContext();

      const provider = getAiProviderFromReq(req);
      const openai = provider === "openai" ? getOpenAIClient() : null;
      if (provider === "openai" && !openai) {
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

      const patientSexHint = req?.body?.patientSex ?? req?.body?.sex ?? "";
      const findings = await extractUltrasoundFindingsFromPdfs({
        openai,
        pdfFiles,
        imageFiles,
        extractedText,
        provider,
        patientSexHint
      });

      const f = findings && typeof findings === "object" ? findings : {};
      const hasAny =
        Object.entries(f).some(([k, v]) => {
          if (k === "otherFindings") return false;
          if (k === "patientSex" || k === "reportDate") return false;
          if (k === "postVoidResidualUrineVolumeMl") {
            const obj = v && typeof v === "object" && !Array.isArray(v) ? v : null;
            const d = typeof obj?.details === "string" ? obj.details.trim() : "";
            const ml = typeof obj?.valueMl === "string" ? obj.valueMl.trim() : "";
            return Boolean(d || ml);
          }
          return typeof v === "string" && v.trim().length > 0;
        }) || (Array.isArray(f.otherFindings) && f.otherFindings.length > 0);

      res.json({ ultrasound: { data: hasAny, findings: f } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  };
}
