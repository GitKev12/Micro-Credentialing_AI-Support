import crypto from "crypto";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { RENDER_SCALE, loadPdf } from "./pdf.js";

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

// A diagram is often assembled from several images (each box of a flowchart is
// its own image, separated by drawn arrows and labels). Merge rects within
// `gap` so the whole diagram comes out as one figure instead of a pile of
// fragments. The gap is generous (~55pt) because arrow/label spans between a
// diagram's pieces are wide; in a single-column lesson two *distinct* figures
// are almost always separated by more than that, so they stay apart.
function mergeNearbyRects(rects, gap, maxHeight = Infinity) {
  const merged = rects.map((rect) => ({ ...rect }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length && !changed; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (!rectsAdjacent(merged[i], merged[j], gap)) continue;
        const union = unionRect(merged[i], merged[j]);
        // Refuse a merge that would grow past `maxHeight` — that's no longer
        // one diagram but several stacked ones (or a whole page), which should
        // stay separate rather than become a giant strip.
        if (union.height > maxHeight) continue;
        merged[i] = union;
        merged.splice(j, 1);
        changed = true;
        break;
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
export async function extractPdfFigures(
  buffer,
  {
    scale = RENDER_SCALE,
    mergeGap = Math.round(scale * 55),
    // A single image this close to page size is a cover / full-page scan, not a
    // content figure — skip it. And a merged figure may not exceed this share
    // of the page height, so stacked diagrams stay separate.
    fullPageRatio = 0.9,
    maxHeightRatio = 0.55
  } = {}
) {
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
      // Compute every image rect, drop full-page covers/scans, merge adjacent
      // ones into whole diagrams (never past maxHeight), then keep those large
      // enough to be a real figure.
      const allRects = matrices
        .map((matrix) => matrixToPixelRect(matrix, viewport))
        .filter((rect) => rect.width > 2 && rect.height > 2)
        .filter(
          (rect) =>
            !(
              rect.width >= viewport.width * fullPageRatio &&
              rect.height >= viewport.height * fullPageRatio
            )
        );
      const rects = mergeNearbyRects(
        allRects,
        mergeGap,
        viewport.height * maxHeightRatio
      ).filter((rect) => rect.width >= MIN_FIGURE_PX && rect.height >= MIN_FIGURE_PX);

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
            // Normalized top-down position on the page, matched against the
            // text lines' `top` so the figure lands beside its explanation.
            top: viewport.height ? rect.y / viewport.height : 0,
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
