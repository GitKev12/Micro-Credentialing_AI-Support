import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";

/**
 * Extracts a PDF's text, page by page.
 *
 * Lecture modules are digitally authored PDFs, so their embedded text layer
 * is read directly (pdfjs). Because pdfjs exposes each text item's font,
 * italic runs are preserved: they arrive wrapped in the ITALIC_OPEN /
 * ITALIC_CLOSE control markers, which the client renders as <em>.
 *
 * Scanned, image-only PDFs come back with (near) empty text; the controller
 * then falls back to real OCR: each page is rasterized (pdfjs +
 * @napi-rs/canvas) and recognized with tesseract.js. Same output shape.
 */

// A PDF whose entire text layer is shorter than this is treated as scanned.
const MIN_TEXT_CHARS = 40;

// Rasterization scale for OCR (~144 DPI on letter-size pages).
const OCR_SCALE = 2;

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

// Tesseract downloads its language model once and caches it here.
const TESSERACT_CACHE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.cache/tesseract"
);

function loadPdf(buffer) {
  return getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: STANDARD_FONTS_DIR,
    cMapUrl: CMAPS_DIR,
    cMapPacked: true,
    isEvalSupported: false
  }).promise;
}

function toExtractionResult(numPages, pageTexts) {
  const pages = pageTexts.map((text, index) => ({ page: index + 1, text }));
  const totalChars = stripStyleMarkers(pageTexts.join("")).replace(/\s+/g, "").length;

  return {
    numPages,
    pages,
    textLength: totalChars,
    hasText: totalChars >= MIN_TEXT_CHARS
  };
}

// Joins one visual row of text items, wrapping italic runs in markers.
// Whitespace-only items never toggle the style, so "word, word" gaps between
// two italic items stay inside a single run.
function buildLine(segments) {
  let text = "";
  let open = false;

  for (const segment of segments) {
    if (!segment.str) continue;
    if (segment.str.trim()) {
      if (segment.italic && !open) {
        text += ITALIC_OPEN;
        open = true;
      } else if (!segment.italic && open) {
        text += ITALIC_CLOSE;
        open = false;
      }
    }
    text += segment.str;
  }

  if (open) text += ITALIC_CLOSE;
  return text.trim();
}

export async function extractPdfText(buffer) {
  const document = await loadPdf(buffer);

  try {
    const italicFonts = new Map();
    const pageTexts = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      // Parsing the operator list loads the font objects into commonObjs —
      // that's where each item's real font name (e.g. "ArialNarrow-Italic")
      // comes from.
      await page.getOperatorList();
      const textContent = await page.getTextContent();

      const isItalicFont = (fontName) => {
        if (!italicFonts.has(fontName)) {
          let italic = false;
          try {
            const font = page.commonObjs.get(fontName);
            italic = /italic|oblique/i.test(font?.name ?? "");
          } catch (_error) {
            // Unresolved font — treat as regular text.
          }
          italicFonts.set(fontName, italic);
        }
        return italicFonts.get(fontName);
      };

      // Same line-grouping rule as before: items that share a y-coordinate
      // stay on one line, a y jump starts a new line.
      const lines = [];
      let segments = [];
      let lastY;

      for (const item of textContent.items) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5];

        if (lastY !== undefined && y !== undefined && y !== lastY && segments.length) {
          lines.push(buildLine(segments));
          segments = [];
        }

        segments.push({ str: item.str, italic: isItalicFont(item.fontName) });
        if (y !== undefined) lastY = y;
      }
      if (segments.length) lines.push(buildLine(segments));

      pageTexts.push(lines.join("\n"));
      page.cleanup();
    }

    return toExtractionResult(document.numPages, pageTexts);
  } finally {
    await document.destroy();
  }
}

/**
 * True OCR for scanned PDFs: rasterize every page and run tesseract on the
 * images. Slow (seconds per page) — but the controller caches the result, so
 * it runs once per module. `maxPages` exists for diagnostics.
 */
export async function extractPdfTextViaOcr(buffer, { maxPages } = {}) {
  const document = await loadPdf(buffer);

  try {
    const pageCount = maxPages
      ? Math.min(document.numPages, maxPages)
      : document.numPages;

    fs.mkdirSync(TESSERACT_CACHE, { recursive: true });
    const worker = await createWorker("eng", 1, { cachePath: TESSERACT_CACHE });
    const pageTexts = [];

    try {
      const canvasFactory = document.canvasFactory;

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: OCR_SCALE });
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
