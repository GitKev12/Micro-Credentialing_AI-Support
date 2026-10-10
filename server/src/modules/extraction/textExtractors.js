import { embeddedTextExtractor } from "./embeddedText.js";
import { ocrExtractor } from "./ocrText.js";

/**
 * Picks how a lesson PDF's text is read (the Strategy pattern, kept simple).
 *
 * Every extractor follows one contract:
 *
 *   { source: "name", extract(buffer) }
 *   extract resolves to { numPages, pages, textLength, hasText }
 *
 * They are tried in order and the first one that finds usable text wins:
 *
 *   1. embedded-text — the PDF's own text layer. Fast; most lessons stop here.
 *   2. ocr           — Tesseract. Only reached when step 1 found no text,
 *                      which means a scanned PDF.
 *
 * Extension point: a future AI vision extractor would be one more object on
 * the end of this list, e.g. { source: "ai-vision", extract }. It costs money
 * per page, so it must not be added until that spend is approved.
 */
export const TEXT_EXTRACTORS = [embeddedTextExtractor, ocrExtractor];

/**
 * Returns the first usable result, with `source` naming which extractor gave it.
 *
 * - An extractor that throws is logged and the next one is tried.
 * - If they all ran but none found text, the PDF has nothing readable (a blank
 *   or picture-only scan): the result comes back with `source: "none"`.
 * - If they all threw, the PDF itself is the problem, and the first error is
 *   thrown so the job is marked failed.
 */
export async function extractLessonText(buffer, extractors = TEXT_EXTRACTORS) {
  let firstError = null;
  let lastResult = null;

  for (const extractor of extractors) {
    try {
      const result = await extractor.extract(buffer);
      if (result.hasText) return { ...result, source: extractor.source };
      lastResult = result;
    } catch (error) {
      console.error(`${extractor.source} extraction failed:`, error.message);
      firstError = firstError ?? error;
    }
  }

  if (!lastResult) throw firstError ?? new Error("No text extractor is set up.");

  return { ...lastResult, source: "none" };
}
