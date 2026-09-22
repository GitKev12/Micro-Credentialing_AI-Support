/**
 * Fills a certificate from a local PDF file, without the server or database.
 *
 *   node scripts/fill-certificate.mjs <blank.pdf>              # writes <blank>-filled.pdf beside it
 *   node scripts/fill-certificate.mjs <blank.pdf> <filled.pdf>
 *
 * For checking the positions in server/src/certificates/certificates.fill.js:
 * fill a blank, open the result, look. The values are SAMPLE_VALUES below —
 * change them to try a very long name, or blank one out to see its line left
 * empty.
 *
 * The positions and the drawing are not repeated here. They live in
 * certificates.fill.js, the same module the server uses when an assessor
 * releases a certificate, so what this writes is what a student would get.
 */

import fs from "fs";
import path from "path";
import { fillCertificate } from "../server/src/certificates/certificates.fill.js";

const SAMPLE_VALUES = {
  studentName: "Juan Dela Cruz",
  courseTitle: "Computer Programming 2",
  courseCode: "CC2",
  dateIssued: "September 20, 2026",
  signature: "Authorized Assessor"
};

const [inputPath, requestedOutput] = process.argv.slice(2);

if (!inputPath) {
  console.error("Usage: node scripts/fill-certificate.mjs <blank.pdf> [filled.pdf]");
  process.exit(1);
}

const outputPath =
  requestedOutput ??
  path.join(path.dirname(inputPath), `${path.basename(inputPath, ".pdf")}-filled.pdf`);

// The blank is the one thing this must never write over.
if (path.resolve(outputPath) === path.resolve(inputPath)) {
  console.error("The output would replace the blank certificate. Name a different file.");
  process.exit(1);
}

// 1. Load the blank certificate into memory.
const templateBytes = fs.readFileSync(inputPath);

// 2–4. Write each value onto the first page at its fixed position.
const { bytes, applied } = await fillCertificate(templateBytes, SAMPLE_VALUES);

// 5. Save the finished document as a new file.
fs.writeFileSync(outputPath, bytes);

console.log(`Wrote ${outputPath}`);
for (const field of applied) {
  console.log(`  ${field.id.padEnd(12)} ${field.fontSize}pt  ${field.value}`);
}
