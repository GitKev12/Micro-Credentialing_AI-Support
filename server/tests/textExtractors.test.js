import { describe, expect, it, jest } from "@jest/globals";
import { extractLessonText, TEXT_EXTRACTORS } from "../src/modules/extraction/textExtractors.js";

/**
 * Choosing how a lesson PDF's text is read.
 *
 * The real extractors need real PDFs, so these use small stand-ins that keep
 * the same contract: { source, extract(buffer) }.
 */

const found = (text) => ({ numPages: 1, pages: [{ page: 1, text }], textLength: text.length, hasText: true });
const nothing = { numPages: 1, pages: [{ page: 1, text: "" }], textLength: 0, hasText: false };

function extractor(source, result) {
  return {
    source,
    extract: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    })
  };
}

describe("TEXT_EXTRACTORS", () => {
  it("tries the PDF's own text first and OCR second", () => {
    expect(TEXT_EXTRACTORS.map((entry) => entry.source)).toEqual(["embedded-text", "ocr"]);
  });
});

describe("extractLessonText", () => {
  it("uses the embedded text when the PDF has it, and never runs OCR", async () => {
    const embedded = extractor("embedded-text", found("A lesson with a real text layer."));
    const ocr = extractor("ocr", found("unused"));

    const result = await extractLessonText(Buffer.from("pdf"), [embedded, ocr]);

    expect(result.source).toBe("embedded-text");
    expect(result.pages[0].text).toBe("A lesson with a real text layer.");
    expect(ocr.extract).not.toHaveBeenCalled();
  });

  it("falls back to OCR only when there is no usable text layer", async () => {
    const embedded = extractor("embedded-text", nothing);
    const ocr = extractor("ocr", found("Text read from a scanned page."));

    const result = await extractLessonText(Buffer.from("pdf"), [embedded, ocr]);

    expect(result.source).toBe("ocr");
    expect(ocr.extract).toHaveBeenCalledTimes(1);
  });

  it("says none when every extractor ran but found nothing", async () => {
    const result = await extractLessonText(Buffer.from("pdf"), [
      extractor("embedded-text", nothing),
      extractor("ocr", nothing)
    ]);

    expect(result.source).toBe("none");
    expect(result.hasText).toBe(false);
  });

  it("moves on when one extractor throws", async () => {
    const result = await extractLessonText(Buffer.from("pdf"), [
      extractor("embedded-text", new Error("bad font table")),
      extractor("ocr", found("OCR still read it."))
    ]);

    expect(result.source).toBe("ocr");
  });

  it("throws the first error when every extractor throws", async () => {
    await expect(
      extractLessonText(Buffer.from("pdf"), [
        extractor("embedded-text", new Error("not a PDF")),
        extractor("ocr", new Error("cannot render"))
      ])
    ).rejects.toThrow("not a PDF");
  });
});
