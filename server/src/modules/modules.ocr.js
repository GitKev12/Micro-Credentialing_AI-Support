import crypto from "crypto";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
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

/* ── Figure extraction ──────────────────────────────────────────────
 *
 * Embedded figures/diagrams are pulled by finding every image-paint op in a
 * page's operator list, computing where it lands on the page (by tracking the
 * current transformation matrix), rendering the page once, then cropping each
 * image region out of the rendered bitmap. Cropping the *rendered* page — rather
 * than reconstructing raw image data — lets pdfjs handle all the decoding, so a
 * figure looks exactly as it does in the PDF.
 */

// Ignore anything smaller than this (bullets, inline icons, rule lines).
const MIN_FIGURE_PX = 56;
// A hard cap so a pathological PDF can't produce hundreds of crops.
const MAX_FIGURES = 40;

// pdfjs matrices are [a, b, c, d, e, f] in column-vector convention.
function multiplyMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

function applyMatrix(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// The image-painting ops we treat as figures. Masks/stencils are skipped —
// they're usually glyph fills, not pictures. Repeats guarded (may be undefined).
function imagePaintOps() {
  const ops = new Set([OPS.paintImageXObject]);
  if (OPS.paintJpegXObject !== undefined) ops.add(OPS.paintJpegXObject);
  if (OPS.paintImageXObjectRepeat !== undefined) ops.add(OPS.paintImageXObjectRepeat);
  return ops;
}

// Walk the operator list, tracking the CTM, and record the matrix in force at
// every image paint. The unit square [0,1]² under that matrix is where the
// image sits in page (user) space.
function collectImageMatrices(operatorList) {
  const { fnArray, argsArray } = operatorList;
  const paintOps = imagePaintOps();
  const matrices = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];

  for (let index = 0; index < fnArray.length; index++) {
    const fn = fnArray[index];
    if (fn === OPS.save) {
      stack.push(ctm.slice());
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform) {
      ctm = multiplyMatrix(ctm, argsArray[index]);
    } else if (paintOps.has(fn)) {
      matrices.push(ctm.slice());
    }
  }
  return matrices;
}

// Map an image's unit square (under `ctm`, in user space) to a pixel rectangle
// on the page rendered at `viewport`, clamped to the page bounds.
function matrixToPixelRect(ctm, viewport) {
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ].map(([ux, uy]) => {
    const [x, y] = applyMatrix(ctm, ux, uy);
    return viewport.convertToViewportPoint(x, y);
  });

  const xs = corners.map((point) => point[0]);
  const ys = corners.map((point) => point[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(viewport.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(viewport.height, Math.ceil(Math.max(...ys)));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// Two rects are "adjacent" if they overlap once each is grown by `gap`.
function rectsAdjacent(a, b, gap) {
  return !(
    a.x > b.x + b.width + gap ||
    b.x > a.x + a.width + gap ||
    a.y > b.y + b.height + gap ||
    b.y > a.y + a.height + gap
  );
}

function unionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y
  };
}

// A diagram is often assembled from several adjacent images (each box of a
// flowchart is its own image). Merge touching rects so the whole diagram comes
// out as one figure instead of a pile of fragments.
function mergeNearbyRects(rects, gap) {
  const merged = rects.map((rect) => ({ ...rect }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length && !changed; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (rectsAdjacent(merged[i], merged[j], gap)) {
          merged[i] = unionRect(merged[i], merged[j]);
          merged.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return merged;
}

// Drop figures that repeat on many pages — running headers, seals, logos.
function dropRepeatedFurniture(figures, numPages) {
  const counts = new Map();
  for (const figure of figures) {
    counts.set(figure.signature, (counts.get(figure.signature) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(numPages / 2));
  return figures.filter((figure) => counts.get(figure.signature) < threshold);
}

/**
 * Extracts embedded figures from a PDF as cropped PNGs.
 *
 * Returns `[{ page, order, width, height, png }]`, ordered by page then by
 * vertical position, with tiny decorations and repeated furniture removed.
 * Pages with no qualifying images are never rendered, so a text-only lesson
 * costs almost nothing here.
 */
export async function extractPdfFigures(buffer, { scale = OCR_SCALE } = {}) {
  const document = await loadPdf(buffer);

  try {
    const canvasFactory = document.canvasFactory;
    const collected = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      const matrices = collectImageMatrices(operatorList);

      if (matrices.length === 0) {
        page.cleanup();
        continue;
      }

      const viewport = page.getViewport({ scale });
      // Compute every image rect, merge adjacent ones into whole diagrams, then
      // keep only those large enough to be a real figure.
      const allRects = matrices
        .map((matrix) => matrixToPixelRect(matrix, viewport))
        .filter((rect) => rect.width > 2 && rect.height > 2);
      const rects = mergeNearbyRects(allRects, Math.round(scale * 22)).filter(
        (rect) => rect.width >= MIN_FIGURE_PX && rect.height >= MIN_FIGURE_PX
      );

      if (rects.length === 0) {
        page.cleanup();
        continue;
      }

      // Render the page once, then crop each figure region out of it.
      const rendered = canvasFactory.create(viewport.width, viewport.height);
      await page.render({ canvasContext: rendered.context, viewport }).promise;

      rects
        .sort((a, b) => a.y - b.y)
        .forEach((rect, order) => {
          const crop = canvasFactory.create(rect.width, rect.height);
          crop.context.drawImage(
            rendered.canvas,
            rect.x, rect.y, rect.width, rect.height,
            0, 0, rect.width, rect.height
          );
          const png = crop.canvas.toBuffer("image/png");
          canvasFactory.destroy(crop);

          collected.push({
            page: pageNumber,
            order,
            width: rect.width,
            height: rect.height,
            png,
            signature: crypto.createHash("md5").update(png).digest("hex")
          });
        });

      canvasFactory.destroy(rendered);
      page.cleanup();

      if (collected.length >= MAX_FIGURES) break;
    }

    return dropRepeatedFurniture(collected, document.numPages)
      .slice(0, MAX_FIGURES)
      .map(({ signature, ...figure }) => figure);
  } finally {
    await document.destroy();
  }
}
