import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * Stamping a certificate by coordinates (text overlay).
 *
 * The template is a design export: one page, with the captions ("NAME OF
 * STUDENT", "DATE ISSUED", ...) drawn as artwork rather than text, so there are
 * no form fields to fill. Each value is written straight onto the page at a
 * fixed position instead. There is one certificate design, so its positions
 * are measured once and written down below.
 *
 * How to read the numbers:
 * - The page is portrait US Letter, 612 x 792 points (72 points = 1 inch).
 *   PDF coordinates start at the bottom-left corner: x grows to the right,
 *   y grows upwards.
 * - The artwork is laid on the page a quarter turn, so every value is written
 *   sideways too, reading from the bottom of the page to the top
 *   (TEXT_ROTATION). That means a line of text runs along y, and x picks which
 *   line of the certificate it sits on.
 *
 * The positions were copied from what the old OCR detection worked out for
 * this template. If the design is ever replaced, they have to be measured
 * again.
 */

// Every value on this template is turned a quarter turn, reading up the page.
const TEXT_ROTATION = 90;

// Long values shrink to fit their space, but never below this size.
const MIN_FONT_SIZE = 6;

const BRAND_RED = rgb(0.5, 0, 0);
const INK = rgb(0.23, 0.23, 0.26);

/**
 * Where each value goes.
 *
 *   x        — which line of the certificate, measured from the left edge.
 *   y        — where on that line: the middle of the text when `align` is
 *              "center", the start of the text when it is "left".
 *   size     — font size in points.
 *   maxWidth — the room the design leaves for it, in points. Text longer
 *              than this is shrunk to fit rather than running past it.
 *   color    — the ink it is written in.
 */
export const CERTIFICATE_FIELDS = {
  studentName: { x: 219.32, y: 395, align: "center", size: 25.92, maxWidth: 554.4, color: BRAND_RED },
  courseTitle: { x: 339.78, y: 395.4, align: "center", size: 16.64, maxWidth: 419.99, color: INK },
  // Sits just after the words "COURSE CODE", so it starts there rather than
  // centring on it.
  courseCode: { x: 366.4, y: 364.08, align: "left", size: 10.4, maxWidth: 198, color: INK },
  dateIssued: { x: 433.24, y: 177.8, align: "center", size: 12.32, maxWidth: 168.82, color: INK },
  signature: { x: 433.24, y: 613.2, align: "center", size: 12.32, maxWidth: 169.2, color: INK }
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

    // drawText places the *start* of the text. The text runs up the page, so
    // centring it on y means starting half its width lower.
    const startY = field.align === "center" ? field.y - width / 2 : field.y;

    // 4. Write the value onto the page.
    page.drawText(text, {
      x: field.x,
      y: startY,
      size,
      font,
      color: field.color,
      rotate: degrees(TEXT_ROTATION)
    });

    applied.push({ id, value: text, fontSize: Number(size.toFixed(2)) });
  }

  // 5. Serialize the finished document.
  const bytes = Buffer.from(await pdf.save());

  return { bytes, applied };
}
