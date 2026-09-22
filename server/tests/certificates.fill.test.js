import { describe, it, expect } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { CERTIFICATE_FIELDS, fillCertificate } from "../src/certificates/certificates.fill.js";

/**
 * Stamping a certificate at fixed coordinates.
 *
 * The positions themselves are checked by eye (scripts/fill-certificate.mjs
 * writes a sample to open). These cover what the code does around them: every
 * value is written, a missing one leaves its line blank, and a long one
 * shrinks to fit rather than running off its line.
 */

// A blank the size of the real template: portrait US Letter, one page.
async function blankCertificate() {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return Buffer.from(await pdf.save());
}

const VALUES = {
  studentName: "Chris Jerome Dayan",
  courseTitle: "Computer Programming 2",
  courseCode: "CC2",
  dateIssued: "September 20, 2026",
  signature: "Michael Torres"
};

describe("fillCertificate", () => {
  it("writes every value at its configured size", async () => {
    const { applied } = await fillCertificate(await blankCertificate(), VALUES);

    expect(applied).toEqual(
      Object.keys(CERTIFICATE_FIELDS).map((id) => ({
        id,
        value: VALUES[id],
        fontSize: CERTIFICATE_FIELDS[id].size
      }))
    );
  });

  it("leaves a line blank when its value is missing", async () => {
    const { applied } = await fillCertificate(await blankCertificate(), {
      ...VALUES,
      courseCode: "",
      signature: undefined
    });

    expect(applied.map((field) => field.id)).toEqual(["studentName", "courseTitle", "dateIssued"]);
  });

  it("shrinks a name too long for its line, rather than running past it", async () => {
    const longName = "Maria Clarissa Josephine Evangelista-Santos de la Cruz y Villanueva";
    const { applied } = await fillCertificate(await blankCertificate(), {
      ...VALUES,
      studentName: longName
    });

    const name = applied.find((field) => field.id === "studentName");
    expect(name.value).toBe(longName);
    expect(name.fontSize).toBeLessThan(CERTIFICATE_FIELDS.studentName.size);
  });

  it("returns a one-page PDF the same size as the blank", async () => {
    const { bytes } = await fillCertificate(await blankCertificate(), VALUES);

    const filled = await PDFDocument.load(bytes);
    expect(filled.getPageCount()).toBe(1);
    expect(filled.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
  });
});
