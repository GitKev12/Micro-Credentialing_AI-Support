import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Stamping a certificate by coordinates (text overlay).
 *
 * The template is a design export: one page, with the captions ("NAME OF
 * STUDENT", "DATE ISSUED", ...) printed on it but no form fields to fill. Each
 * value is written straight onto the page at a fixed position instead. There
 * is one certificate design, so its positions are measured once and written
 * down below.
 *
 * How to read the numbers:
 * - The page is landscape US Letter, 792 x 612 points (72 points = 1 inch).
 *   PDF coordinates start at the bottom-left corner: x grows to the right,
 *   y grows upwards.
 * - x is where the text sits across the page; y is its baseline, the line the
 *   letters stand on.
 *
 * The positions were measured on "Certificate v3.pdf" (October 2026). If the
 * design is ever replaced, they have to be measured again.
 */

// Long values shrink to fit their space, but never below this size.
const MIN_FONT_SIZE = 6;

const BRAND_RED = rgb(0.5, 0, 0);
const INK = rgb(0.23, 0.23, 0.26);

/**
 * Where each value goes.
 *
 *   x        — the middle of the text when `align` is "center", the start of
 *              the text when it is "left".
 *   y        — the baseline of the text.
 *   size     — font size in points.
 *   maxWidth — the room the design leaves for it, in points. Text longer
 *              than this is shrunk to fit rather than running past it.
 *   color    — the ink it is written in.
 */
export const CERTIFICATE_FIELDS = {
  // Between "This certifies that" and the "NAME OF STUDENT" caption.
  studentName: { x: 396, y: 383, align: "center", size: 26, maxWidth: 560, color: BRAND_RED },
  // On the ruled line inside the course box.
  courseTitle: { x: 396, y: 277, align: "center", size: 16.5, maxWidth: 440, color: INK },
  // Sits just after the words "COURSE CODE", so it starts there rather than
  // centring on it.
  courseCode: { x: 366, y: 246, align: "left", size: 10.5, maxWidth: 250, color: INK },
  // Above the two short lines at the bottom.
  dateIssued: { x: 178, y: 183, align: "center", size: 12.5, maxWidth: 180, color: INK },
  signature: { x: 614, y: 183, align: "center", size: 12.5, maxWidth: 180, color: INK }
};

/**
 * Writes the values onto a blank certificate and returns the new PDF.
 *
 *   templateBytes — the blank certificate PDF (a Buffer or Uint8Array)
 *   values        — { studentName, courseTitle, courseCode, dateIssued, signature }
 *
 * Returns { bytes, applied }: the finished PDF as a Buffer, and what was
 * written where, which is kept on the issued certificate's record. A value
 * that is missing or empty is skipped, leaving its line blank.
 */
export async function fillCertificate(templateBytes, values) {
  // 1. Load the blank certificate into memory.
  const pdf = await PDFDocument.load(templateBytes);

  // 2. The certificate is the first (and only) page.
  const page = pdf.getPages()[0];

  // 3. Helvetica is one of the standard PDF fonts, so no font file is needed.
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const applied = [];

  for (const [id, field] of Object.entries(CERTIFICATE_FIELDS)) {
    const text = String(values?.[id] ?? "").trim();
    if (!text) continue;

    // Shrink a long value until it fits its space.
    let size = field.size;
    let width = font.widthOfTextAtSize(text, size);

    if (width > field.maxWidth) {
      size = Math.max(MIN_FONT_SIZE, size * (field.maxWidth / width));
      width = font.widthOfTextAtSize(text, size);
    }

    // drawText places the *start* of the text, so centring it on x means
    // starting half its width to the left.
    const startX = field.align === "center" ? field.x - width / 2 : field.x;

    // 4. Write the value onto the page.
    page.drawText(text, {
      x: startX,
      y: field.y,
      size,
      font,
      color: field.color
    });

    applied.push({ id, value: text, fontSize: Number(size.toFixed(2)) });
  }

  // 5. Serialize the finished document.
  const bytes = Buffer.from(await pdf.save());

  return { bytes, applied };
}
