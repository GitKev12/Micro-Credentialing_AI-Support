import { ITALIC_CLOSE, ITALIC_OPEN, loadPdf, toExtractionResult } from "./pdf.js";

/**
 * Reads the text a PDF already carries (its text layer), page by page.
 *
 * Lecture modules are digitally authored PDFs, so this is the normal path and
 * it takes seconds. Because pdfjs exposes each text item's font, italic runs
 * are kept: they arrive wrapped in the ITALIC_OPEN / ITALIC_CLOSE markers,
 * which the reader renders as <em>.
 *
 * A scanned, image-only PDF comes back with (near) empty text, and
 * `hasText: false` tells textExtractors.js to try OCR next.
 */

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

export async function extractEmbeddedText(buffer) {
  const document = await loadPdf(buffer);

  try {
    const italicFonts = new Map();
    const pageTexts = [];
    const pageLineTops = [];

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

      // A page-space y (bottom-up user units) becomes a normalized top-down
      // fraction, the same convention figure rects use — so a figure and the
      // text around it can be ordered against each other.
      const viewportUnit = page.getViewport({ scale: 1 });
      const normalizeTop = (y) => {
        if (y === undefined || y === null) return null;
        const top = viewportUnit.convertToViewportPoint(0, y)[1];
        return viewportUnit.height ? top / viewportUnit.height : null;
      };

      // Items that share a y-coordinate stay on one line; a y jump starts a
      // new line.
      const lines = [];
      const lineTops = [];
      let segments = [];
      let lastY;

      for (const item of textContent.items) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5];

        if (lastY !== undefined && y !== undefined && y !== lastY && segments.length) {
          lines.push(buildLine(segments));
          lineTops.push(normalizeTop(lastY));
          segments = [];
        }

        segments.push({ str: item.str, italic: isItalicFont(item.fontName) });
        if (y !== undefined) lastY = y;
      }
      if (segments.length) {
        lines.push(buildLine(segments));
        lineTops.push(normalizeTop(lastY));
      }

      pageTexts.push(lines.join("\n"));
      pageLineTops.push(lineTops);
      page.cleanup();
    }

    return toExtractionResult(document.numPages, pageTexts, pageLineTops);
  } finally {
    await document.destroy();
  }
}

/** The extractor contract: a `source` name and an `extract(buffer)` function. */
export const embeddedTextExtractor = {
  source: "embedded-text",
  extract: extractEmbeddedText
};
