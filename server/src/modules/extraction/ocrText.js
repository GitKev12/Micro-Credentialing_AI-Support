import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createWorker } from "tesseract.js";
import { RENDER_SCALE, loadPdf, toExtractionResult } from "./pdf.js";

/**
 * Real OCR for scanned PDFs: draw every page as an image (pdfjs +
 * @napi-rs/canvas) and read it with Tesseract.
 *
 * Slow — seconds per page — which is why it only runs inside a background
 * extraction job (extractionJobs.js), never while a student waits on a
 * request, and only when the PDF has no text layer of its own.
 */

// Tesseract downloads its language model once and caches it here.
const TESSERACT_CACHE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.cache/tesseract"
);

/** `maxPages` exists for diagnostics. */
export async function extractTextWithOcr(buffer, { maxPages } = {}) {
  const document = await loadPdf(buffer);

  try {
    const pageCount = maxPages ? Math.min(document.numPages, maxPages) : document.numPages;

    fs.mkdirSync(TESSERACT_CACHE, { recursive: true });
    const worker = await createWorker("eng", 1, { cachePath: TESSERACT_CACHE });
    const pageTexts = [];

    try {
      const canvasFactory = document.canvasFactory;

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

        await page.render({
          canvasContext: canvasAndContext.context,
          viewport
        }).promise;

        const image = canvasAndContext.canvas.toBuffer("image/png");
        canvasFactory.destroy(canvasAndContext);
        page.cleanup();

        const { data } = await worker.recognize(image);
        pageTexts.push((data.text ?? "").trim());
      }
    } finally {
      await worker.terminate();
    }

    return toExtractionResult(document.numPages, pageTexts);
  } finally {
    await document.destroy();
  }
}

/** The extractor contract: a `source` name and an `extract(buffer)` function. */
export const ocrExtractor = {
  source: "ocr",
  extract: (buffer) => extractTextWithOcr(buffer)
};
