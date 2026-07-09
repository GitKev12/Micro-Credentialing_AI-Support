// The package root of pdf-parse runs debug code when imported from ESM
// (it reads a test PDF from cwd and crashes) — import the library file directly.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/**
 * Extracts the embedded text layer of a PDF, page by page.
 *
 * Lecture modules are digitally authored PDFs, so their text is already
 * embedded and this reads it directly — no rasterizing needed. Scanned,
 * image-only PDFs come back with (near) empty text; callers detect that via
 * `hasText` and can surface a friendly notice instead of blank pages.
 */

// A PDF whose entire text layer is shorter than this is treated as scanned.
const MIN_TEXT_CHARS = 40;

// Same line-grouping rule as pdf-parse's default renderer: items that share a
// y-coordinate stay on one line, a y jump starts a new line — but this variant
// also captures each page's text separately.
function renderPage(pageTexts) {
  return (pageData) =>
    pageData
      .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
      .then((textContent) => {
        let lastY;
        let text = "";

        for (const item of textContent.items) {
          const y = item.transform[5];
          if (lastY !== undefined && y !== lastY) text += "\n";
          text += item.str;
          lastY = y;
        }

        pageTexts.push(text.trim());
        return text;
      });
}

export async function extractPdfText(buffer) {
  const pageTexts = [];
  const parsed = await pdfParse(buffer, { pagerender: renderPage(pageTexts) });

  const pages = pageTexts.map((text, index) => ({ page: index + 1, text }));
  const totalChars = pageTexts.join("").replace(/\s+/g, "").length;

  return {
    numPages: parsed.numpages ?? pages.length,
    pages,
    textLength: totalChars,
    hasText: totalChars >= MIN_TEXT_CHARS
  };
}
