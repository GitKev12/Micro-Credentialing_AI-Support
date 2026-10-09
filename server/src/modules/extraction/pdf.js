import { createRequire } from "module";
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Small helpers every PDF reader in this folder shares: opening a PDF with
 * pdfjs, the italic markers, and the result shape an extractor returns.
 */

// A PDF whose entire text layer is shorter than this is treated as scanned.
const MIN_TEXT_CHARS = 40;

// How large a page is drawn for OCR and for cropping figures (~144 DPI on a
// letter-size page).
export const RENDER_SCALE = 2;

// Inline-style markers wrapped around italic runs. Control characters never
// occur in real lesson text, so they can't collide with content.
export const ITALIC_OPEN = String.fromCharCode(17); // U+0011
export const ITALIC_CLOSE = String.fromCharCode(18); // U+0012
const STYLE_MARKERS = new RegExp("[" + ITALIC_OPEN + ITALIC_CLOSE + "]", "g");

export function stripStyleMarkers(text) {
  return String(text ?? "").replace(STYLE_MARKERS, "");
}

const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve("pdfjs-dist/package.json"));
const STANDARD_FONTS_DIR = path.join(PDFJS_DIR, "standard_fonts") + path.sep;
const CMAPS_DIR = path.join(PDFJS_DIR, "cmaps") + path.sep;

export function loadPdf(buffer) {
  return getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: STANDARD_FONTS_DIR,
    cMapUrl: CMAPS_DIR,
    cMapPacked: true,
    isEvalSupported: false
  }).promise;
}

/**
 * What every text extractor returns:
 *   { numPages, pages: [{ page, text, lineTops }], textLength, hasText }
 *
 * `lineTops` is each line's height on the page (0 = top, 1 = bottom), used to
 * place figures beside their text. It is null when unknown (OCR).
 */
export function toExtractionResult(numPages, pageTexts, pageLineTops) {
  const pages = pageTexts.map((text, index) => ({
    page: index + 1,
    text,
    lineTops: pageLineTops?.[index] ?? null
  }));
  const totalChars = stripStyleMarkers(pageTexts.join("")).replace(/\s+/g, "").length;

  return {
    numPages,
    pages,
    textLength: totalChars,
    hasText: totalChars >= MIN_TEXT_CHARS
  };
}
