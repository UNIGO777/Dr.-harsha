import puppeteer from "puppeteer";

export const generatePdfController = async (req, res) => {
  const { html, fileName } = req.body;

  if (!html) {
    return res.status(400).json({ error: "HTML content is required" });
  }

  console.log(`[PDF] Request received, HTML size: ${(html.length / 1024).toFixed(1)}KB`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Allow Puppeteer to load stylesheets from the Vite dev server on localhost
    await page.setContent(html, { waitUntil: "networkidle2", timeout: 60000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
      timeout: 60000,
    });

    console.log(`[PDF] Done, size: ${(pdfBuffer.length / 1024).toFixed(1)}KB`);

    const safeName = (fileName || "report").replace(/[^a-zA-Z0-9_\- ]/g, "_");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error("[PDF] Error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
};
