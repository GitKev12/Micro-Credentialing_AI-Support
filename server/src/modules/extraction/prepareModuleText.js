import { readModuleFile } from "../moduleFile.js";
import {
  buildLessonBlocks,
  buildSections,
  countReadingMinutes,
  insertFigureBlocks
} from "../modules.format.js";
import { extractPdfFigures } from "./figures.js";
import { storeModuleFigures } from "./figureStore.js";
import { stripStyleMarkers } from "./pdf.js";
import { extractLessonText } from "./textExtractors.js";

/**
 * Turns one lesson's PDF into the content the reader shows.
 *
 *   1. read the PDF from storage
 *   2. read its text (textExtractors.js picks embedded text or OCR)
 *   3. format the text into lesson blocks and sections (modules.format.js)
 *   4. crop its figures and slot them into the blocks (best effort)
 *
 * This only builds the content. Saving it and its job status is
 * extractionJobs.js's job, and that is also the only caller: this is slow
 * work and never runs inside a student's request.
 */

// Bump the version when the extraction/formatting logic changes, so cached
// lessons are prepared again. Every lesson whose cache entry is older is
// re-extracted the next time it is opened.
//
// History: v22: embedded figures are extracted and interleaved into the lesson
// blocks. v23: a diagram's pieces merge into one figure instead of
// fragmenting. v24: figures are placed at their real vertical position (beside
// the matching text) instead of at the end of the page, and evaluation/test
// sections are stripped. v25: figures anchor to their "Figure N" caption text
// when present (geometry is only the fallback), since the reflowed text makes
// raw position unreliable. v26: full-page covers/scans are skipped and
// over-tall merges are split, so a figure is never a whole page or a stack of
// unrelated diagrams. v27: five numbering and placement fixes — a marker
// stranded on its own line is rejoined to its step, a blank line between steps
// no longer ends the run, a split run says which number it resumes at, a
// numbered section title is a heading rather than the first item of a list,
// and a digits-only line is dropped wherever it falls. Prose that merely
// mentions "Figure N" is now read as introducing the picture, so the image
// follows it instead of being placed above it as though the sentence were a
// caption. v28: the lesson's Assignment/Homework part is dropped too.
export const TEXT_FORMAT_VERSION = 28;

function isPdf(module) {
  return (
    (module.contentType ?? "").includes("pdf") ||
    (module.fileType ?? "").toLowerCase() === "pdf"
  );
}

const NO_CONTENT = {
  numPages: 0,
  pages: [],
  blocks: [],
  sections: [],
  readingMinutes: 0,
  textLength: 0,
  hasText: false
};

/**
 * Resolves to the ModuleText content fields for this module. Throws when the
 * PDF can't be read at all, so the job can be marked failed.
 */
export async function prepareModuleText(module) {
  const moduleId = String(module._id);
  const base = {
    moduleId,
    fileId: String(module.fileId ?? ""),
    formatVersion: TEXT_FORMAT_VERSION,
    title: module.title ?? ""
  };

  // Only PDFs have text to read. Anything else is "ready" with nothing in it.
  if (!isPdf(module)) {
    return { ...base, ...NO_CONTENT, source: "unsupported-type", extractedAt: new Date() };
  }

  const buffer = await readModuleFile(module);
  const extracted = await extractLessonText(buffer);

  let blocks = extracted.hasText ? buildLessonBlocks(extracted.pages) : [];

  // A figure failure must never fail the whole lesson: the text still renders.
  if (extracted.hasText) {
    try {
      const figures = await storeModuleFigures(moduleId, await extractPdfFigures(buffer));
      blocks = insertFigureBlocks(blocks, figures);
    } catch (error) {
      console.error(`Figure extraction failed for module ${moduleId}:`, error.message);
    }
  }

  return {
    ...base,
    numPages: extracted.numPages,
    // Raw page text is stored without the inline style markers.
    pages: extracted.pages.map((entry) => ({
      page: entry.page,
      text: stripStyleMarkers(entry.text)
    })),
    blocks,
    sections: buildSections(blocks),
    readingMinutes: blocks.length ? countReadingMinutes(blocks) : 0,
    textLength: extracted.textLength,
    hasText: extracted.hasText,
    source: extracted.source,
    extractedAt: new Date()
  };
}
