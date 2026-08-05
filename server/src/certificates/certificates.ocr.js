import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";

/**
 * Reads a blank certificate and works out where its values belong.
 *
 * The stored template is a design export: one page, no text layer and no form
 * fields, so there is nothing to fill in the usual sense — the words "NAME OF
 * STUDENT" are pixels. This module therefore OCRs the page to find the field
 * labels, then reads the artwork itself to decide where each value sits.
 *
 * The placement rule comes from how these certificates are actually drawn: a
 * label captions the blank *above* it. So for each label we look upward for a
 * ruled line and put the value on it; where the design leaves open space
 * instead of a rule (the student's name), the value is centred in the gap
 * between the label and whatever text sits above it. Nothing here is a
 * hardcoded coordinate, which is what lets a redesigned template keep working.
 *
 * The result is expressed in PDF user space so the filler never has to think
 * about rasters, and it is cached by the caller — this runs once per template.
 */

// Bump when detection changes, so cached layouts re-analyse on next use.
// v2: the course caption carries two values — the full course name on its rule
// and the course code beside the caption itself.
export const LAYOUT_VERSION = 2;

// ~180 DPI on a letter-size page: enough for tesseract to read the small
// letter-spaced captions, cheap enough to run in a request.
const SCALE = 2.5;

// A run of ink this many pixels wide (at SCALE) counts as a ruled line, and it
// has to be no taller than this to be a rule rather than a block of artwork.
const RULE_MIN_LENGTH = 250;
const RULE_MAX_THICKNESS = 8;

// How far above a label we will look for its rule, in multiples of the label's
// own height. Generous enough for the widest gap in this design (~4x), tight
// enough that a label never claims a rule belonging to something else.
const RULE_SEARCH_HEIGHTS = 8;

const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve("pdfjs-dist/package.json"));
const TESSERACT_CACHE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.cache/tesseract"
);

/**
 * The values this system knows how to inject, and how each should look.
 *
 * `anchor` says where the value goes relative to its caption:
 *   "above" — on the ruled line the caption sits under, centred on that line;
 *             where the design leaves open space instead, centred in the gap.
 *   "after" — on the caption's own baseline, just to its right.
 *
 * Two fields may share one caption as long as they anchor differently, which
 * is how the course line carries both halves of its answer: the full course
 * name on the rule, and the course code beside the words "COURSE CODE".
 *
 * Sizes are multiples of the caption's own height rather than absolute points,
 * so a template exported at a different page size still reads right. `match`
 * is checked against the OCR text with spaces stripped, because these captions
 * are letter-spaced and tesseract's word splitting is not reliable across that.
 */
const FIELDS = [
  {
    id: "studentName",
    match: ["nameofstudent", "studentname", "nameofrecipient"],
    anchor: "above",
    sizeFactor: 5.4,
    tone: "brand",
    // No rule under the name in this design — it floats in open space, so it
    // needs a width budget of its own.
    openWidthRatio: 0.7
  },
  {
    id: "courseTitle",
    match: ["coursecode", "coursetitle", "coursename", "course"],
    anchor: "above",
    sizeFactor: 3.2,
    tone: "ink",
    openWidthRatio: 0.5
  },
  {
    id: "courseCode",
    match: ["coursecode", "coursetitle", "coursename", "course"],
    anchor: "after",
    sizeFactor: 2.0,
    tone: "ink",
    openWidthRatio: 0.25
  },
  {
    id: "dateIssued",
    match: ["dateissued", "issuedon", "date"],
    anchor: "above",
    sizeFactor: 2.2,
    tone: "ink",
    openWidthRatio: 0.25
  },
  {
    id: "signature",
    match: ["authorizedsignature", "signature", "signedby"],
    anchor: "above",
    sizeFactor: 2.2,
    tone: "ink",
    openWidthRatio: 0.25
  }
];

const normalize = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function loadPdf(buffer) {
  return getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: path.join(PDFJS_DIR, "standard_fonts") + path.sep,
    cMapUrl: path.join(PDFJS_DIR, "cmaps") + path.sep,
    cMapPacked: true,
    isEvalSupported: false
  }).promise;
}

/** Renders page 1 at `rotation`, returning the bitmap plus its viewport. */
async function renderPage(document, rotation) {
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: SCALE, rotation });
  const canvasAndContext = document.canvasFactory.create(viewport.width, viewport.height);

  await page.render({ canvasContext: canvasAndContext.context, viewport }).promise;

  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);
  const pixels = canvasAndContext.context.getImageData(0, 0, width, height).data;
  const png = canvasAndContext.canvas.toBuffer("image/png");

  document.canvasFactory.destroy(canvasAndContext);
  page.cleanup();

  return { viewport, width, height, pixels, png };
}

/** Flattens tesseract's block tree into a flat list of words with boxes. */
function collectWords(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectWords(child, out));
    return out;
  }
  if (node.words) out.push(...node.words);
  if (node.lines) collectWords(node.lines, out);
  if (node.paragraphs) collectWords(node.paragraphs, out);
  if (node.blocks) collectWords(node.blocks, out);
  return out;
}

/**
 * Rebuilds label phrases from loose words.
 *
 * "AUTHORIZED SIGNATURE" arrives as two words and shares a text line with
 * "DATE ISSUED" at the other end of the page, so tesseract's own line grouping
 * is useless here: words are regrouped by baseline *and* proximity, which
 * keeps the two captions apart.
 */
function groupPhrases(words) {
  const usable = words
    .filter((word) => word.confidence >= 55 && word.text.trim())
    .map((word) => ({ ...word.bbox, text: word.text }))
    .sort((a, b) => a.y0 - b.y0);

  // Cluster into rows before reading left to right. Sorting on y0 alone is not
  // enough: "DATE ISSUED" and "AUTHORIZED SIGNATURE" share a baseline to
  // within a pixel, and that pixel is enough to interleave the two captions
  // into one unreadable phrase.
  const rows = [];
  for (const word of usable) {
    const middle = (word.y0 + word.y1) / 2;
    const height = word.y1 - word.y0;
    const row = rows.find(
      (candidate) => Math.abs(candidate.middle - middle) <= Math.max(4, height * 0.7)
    );

    if (row) {
      row.words.push(word);
      row.middle = (row.middle * (row.words.length - 1) + middle) / row.words.length;
    } else {
      rows.push({ middle, words: [word] });
    }
  }

  const phrases = [];

  for (const row of rows) {
    row.words.sort((a, b) => a.x0 - b.x0);
    let current = null;

    for (const word of row.words) {
      const height = word.y1 - word.y0;
      // A gap wider than a few characters starts a new caption — this is what
      // keeps the two bottom captions on opposite sides of the page apart.
      if (current && word.x0 - current.x1 <= height * 4) {
        current.text += ` ${word.text}`;
        current.x1 = Math.max(current.x1, word.x1);
        current.y0 = Math.min(current.y0, word.y0);
        current.y1 = Math.max(current.y1, word.y1);
        continue;
      }

      current = { text: word.text, x0: word.x0, x1: word.x1, y0: word.y0, y1: word.y1 };
      phrases.push(current);
    }
  }

  return phrases.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/**
 * Horizontal ruled lines in the artwork.
 *
 * Ink is measured against each row's own background rather than an absolute
 * threshold, because these rules are pale pink on a pale pink panel — a fixed
 * cutoff either misses them or drowns in the decorative waves.
 */
function findRules(pixels, width, height) {
  const luminance = (x, y) => {
    const index = (y * width + x) * 4;
    return 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
  };

  const runs = [];

  for (let y = 0; y < height; y += 1) {
    const sample = [];
    for (let x = 0; x < width; x += 17) sample.push(luminance(x, y));
    sample.sort((a, b) => a - b);
    const background = sample[Math.floor(sample.length * 0.75)];

    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const isInk = x < width && luminance(x, y) < background - 30;

      if (isInk && start < 0) start = x;
      else if (!isInk && start >= 0) {
        if (x - start >= RULE_MIN_LENGTH) runs.push({ y, x0: start, x1: x - 1 });
        start = -1;
      }
    }
  }

  // Stack vertically adjacent runs of the same extent into one rule.
  const rules = [];
  for (const run of runs) {
    const existing = rules.find(
      (rule) =>
        Math.abs(rule.x0 - run.x0) < 25 &&
        Math.abs(rule.x1 - run.x1) < 25 &&
        run.y - rule.y1 <= 3
    );

    if (existing) {
      existing.y1 = run.y;
      existing.thickness += 1;
    } else {
      rules.push({ x0: run.x0, x1: run.x1, y0: run.y, y1: run.y, thickness: 1 });
    }
  }

  return rules.filter((rule) => rule.thickness <= RULE_MAX_THICKNESS);
}

/** The darkest colour inside a box — used to borrow the template's own ink. */
function darkestColor(pixels, width, box) {
  let best = null;
  let bestLuminance = Infinity;

  for (let y = Math.max(0, box.y0); y <= box.y1; y += 1) {
    for (let x = Math.max(0, box.x0); x <= box.x1; x += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      if (luminance < bestLuminance) {
        bestLuminance = luminance;
        best = { r: r / 255, g: g / 255, b: b / 255 };
      }
    }
  }

  return best ?? { r: 0.15, g: 0.15, b: 0.15 };
}

/**
 * Finds the field labels on one rendering. Returns null unless at least half
 * of them are present, which is how the caller picks the page rotation that
 * makes the artwork upright.
 */
function locateFields(phrases) {
  const found = new Map();
  // A caption is claimed once *per anchor*: "DATE ISSUED" and "AUTHORIZED
  // SIGNATURE" must never collapse onto the same words, but the course caption
  // is deliberately used twice — once for the rule above it, once beside it.
  const claimed = new Set();

  // Exact matches first, then containment, so a stray "COURSE" elsewhere on
  // the page cannot beat the real "COURSE CODE" caption to its field.
  for (const exact of [true, false]) {
    for (const phrase of phrases) {
      const key = normalize(phrase.text);
      if (!key) continue;

      for (const field of FIELDS) {
        if (found.has(field.id)) continue;

        const claim = `${phrase.x0}:${phrase.y0}:${field.anchor}`;
        if (claimed.has(claim)) continue;

        const hit = exact
          ? field.match.includes(key)
          : field.match.some((candidate) => key.includes(candidate));
        if (!hit) continue;

        found.set(field.id, { field, box: phrase });
        claimed.add(claim);
      }
    }
  }

  return found;
}

/**
 * Analyses a blank certificate template.
 *
 * Tries each page rotation until the labels read as words, so a landscape
 * design exported into a portrait page — which is exactly what this template
 * is — is handled without anyone having to say so.
 */
export async function analyzeCertificateTemplate(buffer) {
  const document = await loadPdf(buffer);

  fs.mkdirSync(TESSERACT_CACHE, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath: TESSERACT_CACHE });

  try {
    let best = null;

    for (const rotation of [0, 90, 270, 180]) {
      const render = await renderPage(document, rotation);
      const { data } = await worker.recognize(render.png, {}, { blocks: true });
      const phrases = groupPhrases(collectWords(data.blocks));
      const found = locateFields(phrases);

      if (!best || found.size > best.found.size) {
        best = { rotation, render, phrases, found };
      }
      // Every field accounted for — no reason to try the other three turns.
      if (found.size === FIELDS.length) break;
    }

    if (!best || best.found.size === 0) {
      throw new Error("No certificate field labels could be read from the template.");
    }

    return buildLayout(best);
  } finally {
    await worker.terminate();
    await document.destroy();
  }
}

function buildLayout({ rotation, render, phrases, found }) {
  const { viewport, width, height, pixels } = render;
  const rules = findRules(pixels, width, height);

  // The template's own ink, taken from the largest caption on the page.
  const heading = [...phrases].sort(
    (a, b) => (b.y1 - b.y0) * (b.x1 - b.x0) - (a.y1 - a.y0) * (a.x1 - a.x0)
  )[0];
  const brand = heading ? darkestColor(pixels, width, heading) : { r: 0.5, g: 0.05, b: 0.09 };
  const ink = { r: 0.23, g: 0.23, b: 0.26 };

  // Image X maps to one PDF axis and image Y to the other; measuring both
  // gives the scale without assuming which way the page is turned.
  const origin = viewport.convertToPdfPoint(0, 0);
  const alongX = viewport.convertToPdfPoint(1, 0);
  const advance = { x: alongX[0] - origin[0], y: alongX[1] - origin[1] };
  const pointsPerPixel = Math.hypot(advance.x, advance.y);
  const unit = { x: advance.x / pointsPerPixel, y: advance.y / pointsPerPixel };

  const pageWidth = width * pointsPerPixel;
  const fields = [];

  for (const { field, box } of found.values()) {
    const labelHeight = box.y1 - box.y0;
    const centerX = (box.x0 + box.x1) / 2;

    let baselineY;
    let anchorX;
    let maxWidthPx;
    let align = "center";
    let anchoredTo;

    if (field.anchor === "after") {
      // Beside the caption, sharing its baseline: "COURSE CODE   CC2".
      baselineY = box.y1;
      anchorX = box.x1 + labelHeight * 1.4;
      maxWidthPx = width * field.openWidthRatio;
      align = "left";
      anchoredTo = "label";
    } else {
      // The rule this caption sits under: above it, close enough to belong to
      // it, and wide enough to run under the caption's centre.
      const rule = rules
        .filter(
          (candidate) =>
            candidate.y1 < box.y0 &&
            box.y0 - candidate.y1 <= labelHeight * RULE_SEARCH_HEIGHTS &&
            candidate.x0 - labelHeight <= centerX &&
            candidate.x1 + labelHeight >= centerX
        )
        .sort((a, b) => b.y1 - a.y1)[0];

      if (rule) {
        // Sit on the line, lifted by a hair so descenders clear it.
        baselineY = rule.y0 - labelHeight * 0.35;
        anchorX = (rule.x0 + rule.x1) / 2;
        maxWidthPx = (rule.x1 - rule.x0) * 0.94;
        anchoredTo = "rule";
      } else {
        // Open space: centre the value between this caption and the nearest
        // thing printed above it.
        const above = phrases
          .filter((phrase) => phrase.y1 < box.y0 - labelHeight)
          .sort((a, b) => b.y1 - a.y1)[0];
        const ceiling = above ? above.y1 : Math.max(0, box.y0 - labelHeight * 12);

        baselineY = (ceiling + box.y0) / 2 + labelHeight * 0.9;
        anchorX = centerX;
        maxWidthPx = width * field.openWidthRatio;
        anchoredTo = "gap";
      }
    }

    const [x, y] = viewport.convertToPdfPoint(anchorX, baselineY);

    fields.push({
      id: field.id,
      label: box.text,
      // Where the value hangs, in PDF user space: its midpoint when centred,
      // its starting edge when left-aligned.
      anchor: { x, y },
      align,
      // Unit vector the text advances along, so the filler can place it
      // without knowing how the page is turned.
      advance: unit,
      rotation,
      fontSize: Number((labelHeight * pointsPerPixel * field.sizeFactor).toFixed(2)),
      maxWidth: Number((maxWidthPx * pointsPerPixel).toFixed(2)),
      color: field.tone === "brand" ? brand : ink,
      anchoredTo
    });
  }

  return {
    version: LAYOUT_VERSION,
    rotation,
    page: { width: pageWidth, height: height * pointsPerPixel },
    fields
  };
}
