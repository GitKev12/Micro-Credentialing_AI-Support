import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { toAssessmentSummary } from "../assessments/assessments.format.js";
import {
  findCourse,
  loadClassSuspension,
  loadStudentRestriction,
  refuseRestrictedCourse,
  toCourseAccess
} from "../lib/courseAccess.js";
import { extractPdfFigures, extractPdfText, extractPdfTextViaOcr, stripStyleMarkers } from "./modules.ocr.js";
import {
  buildLessonBlocks,
  buildSections,
  countReadingMinutes,
  insertFigureBlocks
} from "./modules.format.js";
import { sortLessons } from "../lib/lessonOrder.js";

/**
 * Learning modules (lessons) and assessments for a course.
 *
 * Module metadata lives in the LearningModule collection; the lesson files
 * themselves are stored in GridFS (LearningModule.files / .chunks). Expected
 * module document shape:
 *   { _id, title, subject, fileName, fileType, contentType, fileSize,
 *     fileId, bucket, uploadDate, courseCode, courseId }
 *
 * Assessments follow the same lookout pattern as the other endpoints: the
 * Assessment collection has no documents yet, so the list stays empty until
 * assessments are created. Flexible field names are accepted:
 *   { _id, courseId, title, description, status, dueDate }
 */
const MODULES_COLLECTION = "LearningModule";
const ASSESSMENTS_COLLECTION = "Assessment";
const DEFAULT_BUCKET = "LearningModule";
const COURSES_COLLECTION = "Course";
const COURSE_IMAGES_BUCKET = "CourseImage";

// OCR/text-extraction results are cached here, one document per module, so
// each PDF is only parsed once: { moduleId, fileId, numPages, pages, ... }.
// Bump the version when the extraction/formatting logic changes so stale
// cache entries re-extract on their next request. v22: embedded figures are
// extracted and interleaved into the lesson blocks. v23: a diagram's pieces
// merge into one figure instead of fragmenting. v24: figures are placed at
// their real vertical position (beside the matching text) instead of at the
// end of the page, and evaluation/test sections are stripped. v25: figures
// anchor to their "Figure N" caption text when present (geometry is only the
// fallback), since the reflowed text makes raw position unreliable. v26:
// full-page covers/scans are skipped and over-tall merges are split, so a
// figure is never a whole page or a stack of unrelated diagrams.
const MODULE_TEXT_COLLECTION = "ModuleText";
const TEXT_FORMAT_VERSION = 26;

// Cropped figure images (PNG) are stored here, one GridFS file per figure,
// tagged with metadata.moduleId so a re-extraction can replace them.
const MODULE_FIGURES_BUCKET = "ModuleFigure";

// Per-student lesson completion, one document per completed module:
// { studentId, courseId, moduleId, completedAt }.
const PROGRESS_COLLECTION = "ModuleProgress";

function courseMatch(courseId) {
  return { $or: [{ courseId: { $in: idCandidates(courseId) } }, { courseCode: courseId }] };
}

function toPublicModule(module) {
  return {
    id: module._id,
    title: module.title ?? module.fileName ?? "",
    subject: module.subject ?? module.courseCode ?? "",
    fileName: module.fileName ?? "",
    fileType: module.fileType ?? "",
    fileSize: module.fileSize ?? null,
    uploadDate: module.uploadDate ?? null
  };
}

function toPublicAssessment(assessment) {
  // The canonical shape lives in assessments.format.js — id, moduleId, scope,
  // itemCount and the scoring fields all come from there, so a quiz reads the
  // same whichever endpoint served it. `status` and `dueDate` are scheduling
  // fields this collection carries but the format does not describe.
  return {
    ...toAssessmentSummary(assessment),
    status: assessment.status ?? "open",
    dueDate: assessment.dueDate ?? assessment.due_date ?? null
  };
}

/**
 * The course a reader was opened on: its name, its run, and whether that run
 * is over.
 *
 * Sent with the lessons because the reader is a page a student can land on
 * directly — on a refresh there is no card behind it to have carried the
 * course, and `ended` is what decides whether the page is read-only.
 */
function toPublicCourse(course, suspension = null) {
  if (!course) return null;

  return {
    id: course._id,
    code: String(course.code ?? course.courseCode ?? "").trim(),
    title: course.title ?? course.courseName ?? course.name ?? "",
    ...toCourseAccess(course, new Date(), suspension)
  };
}

/**
 * Whether the signed-in student's class for this course has been switched off.
 *
 * Only a student is gated. An assessor or an admin opening the same lesson is
 * looking at the material, not sitting the course, and a class that stopped
 * running is no reason to hide it from them.
 *
 * `courseRef` may be a course document, a course id, or a course code.
 */
async function viewerSuspension(request, courseRef) {
  if (request.session?.role !== "student") return null;
  return loadClassSuspension(request.session.id, courseRef);
}

/**
 * Turns a lesson route away when the viewer's class has been switched off —
 * closing its lessons is the whole point of the switch, so the refusal comes
 * before the file is read or its text extracted.
 *
 * Returns the sent response when it refused, and null when the route may carry
 * on, so a handler reads as `if (refused) return refused;`.
 */
async function refuseIfSuspended(request, response, module) {
  const suspension = await viewerSuspension(request, module.courseId ?? module.courseCode);
  return suspension ? refuseRestrictedCourse(response, suspension) : null;
}

export async function getCourseModules(request, response) {
  const courseId = request.params.courseId;
  const found = await findCourse(courseId);
  const suspension = await viewerSuspension(request, found ?? courseId);
  const course = toPublicCourse(found, suspension);

  // A switched-off class hands back the course but none of its lessons, so the
  // reader has a name and a reason to show instead of an empty rail it cannot
  // explain. The lesson routes refuse on their own — this is not the gate.
  if (suspension) {
    return response.json({ course, modules: [] });
  }

  if (!(await collectionExists(MODULES_COLLECTION))) {
    return response.json({ course, modules: [], pending: true });
  }

  const modules = await mongoose.connection
    .collection(MODULES_COLLECTION)
    .find(courseMatch(courseId))
    .toArray();

  sortLessons(modules);

  return response.json({ course, modules: modules.map(toPublicModule) });
}

export async function getCourseAssessments(request, response) {
  const courseId = request.params.courseId;

  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) {
    return response.json({ assessments: [], pending: true });
  }

  const assessments = await mongoose.connection
    .collection(ASSESSMENTS_COLLECTION)
    .find(courseMatch(courseId))
    .toArray();

  return response.json({ assessments: assessments.map(toPublicAssessment) });
}

async function findModule(moduleId) {
  return mongoose.connection
    .collection(MODULES_COLLECTION)
    .findOne({ _id: { $in: idCandidates(moduleId) } });
}

async function findModuleFile(module) {
  const bucketName = module.bucket ?? DEFAULT_BUCKET;
  const fileDocument = await mongoose.connection
    .collection(`${bucketName}.files`)
    .findOne({ _id: { $in: idCandidates(module.fileId) } });
  return { bucketName, fileDocument };
}

export async function getModuleFile(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const refused = await refuseIfSuspended(request, response, module);
  if (refused) return refused;

  const { bucketName, fileDocument } = await findModuleFile(module);

  if (!fileDocument) {
    return response.status(404).json({ message: "Module file is missing from storage." });
  }

  response.set({
    "Content-Type": module.contentType ?? "application/octet-stream",
    "Content-Length": fileDocument.length,
    "Content-Disposition": `inline; filename="${module.fileName ?? "module"}"`
  });

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  const stream = bucket.openDownloadStream(fileDocument._id);

  stream.on("error", () => {
    if (!response.headersSent) {
      response.status(500).json({ message: "Failed to read the module file." });
    } else {
      response.end();
    }
  });

  return stream.pipe(response);
}

function readGridFsBuffer(bucketName, fileId) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  const chunks = [];

  return new Promise((resolve, reject) => {
    bucket
      .openDownloadStream(fileId)
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// Uploads a module's freshly-cropped figures to GridFS, replacing any from a
// previous extraction. Returns `[{ fileId, page, width, height }]` for the
// blocks to reference.
async function storeModuleFigures(moduleId, figures) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: MODULE_FIGURES_BUCKET
  });

  // Drop figures left over from an earlier extraction of this module.
  const previous = await bucket.find({ "metadata.moduleId": moduleId }).toArray();
  await Promise.all(previous.map((file) => bucket.delete(file._id).catch(() => {})));

  const stored = [];
  for (const figure of figures) {
    const fileId = await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(`fig-${moduleId}-p${figure.page}-${figure.order}.png`, {
        contentType: "image/png",
        metadata: { moduleId, page: figure.page }
      });
      upload.on("error", reject).on("finish", () => resolve(upload.id));
      upload.end(figure.png);
    });
    stored.push({
      fileId: String(fileId),
      page: figure.page,
      width: figure.width,
      height: figure.height,
      top: figure.top ?? null
    });
  }
  return stored;
}

function toTextResponse(record, cached) {
  return {
    id: record.moduleId,
    title: record.title,
    numPages: record.numPages,
    hasText: record.hasText,
    source: record.source,
    textLength: record.textLength,
    pages: record.pages,
    blocks: record.blocks ?? [],
    sections: record.sections ?? [],
    readingMinutes: record.readingMinutes ?? 0,
    extractedAt: record.extractedAt,
    cached
  };
}

// Returns { record, cached } — serving the cache when it's fresh, otherwise
// extracting, formatting, and re-caching. Failures return { error }.
async function getOrExtractModuleText(module) {
  const moduleKey = String(module._id);
  const fileKey = String(module.fileId ?? "");
  const textCollection = mongoose.connection.collection(MODULE_TEXT_COLLECTION);

  // Serve the cached extraction unless the module's file was replaced or the
  // cache entry predates the current formatter.
  const cachedRecord = await textCollection.findOne({ moduleId: moduleKey });
  if (
    cachedRecord &&
    cachedRecord.fileId === fileKey &&
    cachedRecord.formatVersion === TEXT_FORMAT_VERSION
  ) {
    return { record: cachedRecord, cached: true };
  }

  const isPdf =
    (module.contentType ?? "").includes("pdf") ||
    (module.fileType ?? "").toLowerCase() === "pdf";

  if (!isPdf) {
    return {
      cached: false,
      record: {
        moduleId: moduleKey,
        title: module.title ?? "",
        numPages: 0,
        hasText: false,
        source: "unsupported-type",
        textLength: 0,
        pages: [],
        blocks: [],
        sections: [],
        readingMinutes: 0
      }
    };
  }

  const { bucketName, fileDocument } = await findModuleFile(module);

  if (!fileDocument) {
    return { error: { status: 404, message: "Module file is missing from storage." } };
  }

  let buffer;
  let extracted;
  try {
    buffer = await readGridFsBuffer(bucketName, fileDocument._id);
    extracted = await extractPdfText(buffer);
  } catch (error) {
    console.error(`Text extraction failed for module ${moduleKey}:`, error.message);
    return { error: { status: 500, message: "Failed to extract text from this module." } };
  }

  // No embedded text layer means a scanned document — fall back to real OCR
  // (tesseract). Slow, but cached like everything else, so it runs once.
  let source = extracted.hasText ? "embedded-text" : "none";
  if (!extracted.hasText) {
    try {
      const ocrResult = await extractPdfTextViaOcr(buffer);
      if (ocrResult.hasText) {
        extracted = ocrResult;
        source = "ocr";
      }
    } catch (error) {
      console.error(`OCR fallback failed for module ${moduleKey}:`, error.message);
    }
  }

  let blocks = extracted.hasText ? buildLessonBlocks(extracted.pages) : [];

  // Pull embedded figures and slot them into the blocks by page. Best-effort:
  // a figure failure must never fail the whole lesson (the text still renders).
  if (extracted.hasText) {
    try {
      const figures = await storeModuleFigures(moduleKey, await extractPdfFigures(buffer));
      blocks = insertFigureBlocks(blocks, figures);
    } catch (error) {
      console.error(`Figure extraction failed for module ${moduleKey}:`, error.message);
    }
  }

  const record = {
    moduleId: moduleKey,
    fileId: fileKey,
    formatVersion: TEXT_FORMAT_VERSION,
    title: module.title ?? "",
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
    source,
    extractedAt: new Date()
  };

  await textCollection.updateOne(
    { moduleId: moduleKey },
    { $set: record },
    { upsert: true }
  );

  return { record, cached: false };
}

export async function getModuleText(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const refused = await refuseIfSuspended(request, response, module);
  if (refused) return refused;

  const result = await getOrExtractModuleText(module);
  if (result.error) {
    return response.status(result.error.status).json({ message: result.error.message });
  }

  return response.json(toTextResponse(result.record, result.cached));
}

// Lightweight section list for the curriculum dropdown — same cache, no blocks.
export async function getModuleSections(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const refused = await refuseIfSuspended(request, response, module);
  if (refused) return refused;

  const result = await getOrExtractModuleText(module);
  if (result.error) {
    return response.status(result.error.status).json({ message: result.error.message });
  }

  const { record } = result;
  return response.json({
    id: record.moduleId,
    title: record.title,
    hasText: record.hasText,
    sections: record.sections ?? []
  });
}

// Streams a course's background picture from the CourseImage bucket.
export async function getCourseImage(request, response) {
  const course = await mongoose.connection
    .collection(COURSES_COLLECTION)
    .findOne({ _id: { $in: idCandidates(request.params.courseId) } });

  if (!course?.imageFileId) {
    return response.status(404).json({ message: "Course image not found." });
  }

  response.set({
    "Content-Type": course.imageContentType ?? "image/png",
    "Cache-Control": "public, max-age=86400"
  });

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: COURSE_IMAGES_BUCKET
  });
  const stream = bucket.openDownloadStream(course.imageFileId);

  stream.on("error", () => {
    if (!response.headersSent) {
      response.status(404).json({ message: "Course image is missing from storage." });
    } else {
      response.end();
    }
  });

  return stream.pipe(response);
}

// Streams a single cropped figure PNG from the ModuleFigure bucket.
export async function getModuleFigure(request, response) {
  // A figure is part of the lesson, so it closes with it. The ids only come
  // from the text route, which refuses too — this stops a page left open in
  // another tab from still pulling the pictures.
  const module = await findModule(request.params.moduleId);
  const refused = module ? await refuseIfSuspended(request, response, module) : null;
  if (refused) return refused;

  let figureId;
  try {
    figureId = new mongoose.Types.ObjectId(request.params.figureId);
  } catch {
    return response.status(400).json({ message: "Invalid figure id." });
  }

  response.set({
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=86400"
  });

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: MODULE_FIGURES_BUCKET
  });
  const stream = bucket.openDownloadStream(figureId);

  stream.on("error", () => {
    if (!response.headersSent) {
      response.status(404).json({ message: "Figure not found." });
    } else {
      response.end();
    }
  });

  return stream.pipe(response);
}

export async function getCourseProgress(request, response) {
  const { studentId, courseId } = request.params;

  if (!(await collectionExists(PROGRESS_COLLECTION))) {
    return response.json({ completedModuleIds: [], pending: true });
  }

  const entries = await mongoose.connection
    .collection(PROGRESS_COLLECTION)
    .find({
      studentId: { $in: idCandidates(studentId) },
      courseId: { $in: idCandidates(courseId) }
    })
    .toArray();

  return response.json({
    completedModuleIds: entries.map((entry) => entry.moduleId)
  });
}

export async function markModuleComplete(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  // A course whose run is over is read-only: the lesson stays open to read,
  // but nothing more is written against it. A class switched off is shut
  // outright. The reader hides the tick too — this is the half that makes it a
  // rule (see courseAccess.js).
  // Lessons written without a courseId name their course by code instead, and
  // findCourse takes either — the gate must not turn on how a lesson was linked.
  const restriction = await loadStudentRestriction(
    request.params.studentId,
    module.courseId ?? module.courseCode
  );
  if (restriction) return refuseRestrictedCourse(response, restriction);

  const record = {
    studentId: String(request.params.studentId),
    moduleId: String(module._id),
    courseId: String(module.courseId ?? ""),
    completedAt: new Date()
  };

  await mongoose.connection
    .collection(PROGRESS_COLLECTION)
    .updateOne(
      { studentId: record.studentId, moduleId: record.moduleId },
      { $set: record },
      { upsert: true }
    );

  // Finishing the lesson unlocks its quiz. It deliberately does not write it:
  // the questions cost a model call, and a lesson read by someone who never
  // opens the quiz should cost nothing. Writing happens when the student
  // presses "Take the Quiz" — see prepareLessonAssessment.
  return response.json({ completed: true, moduleId: record.moduleId });
}

export async function unmarkModuleComplete(request, response) {
  const { studentId, moduleId } = request.params;

  // Undoing a completion is still writing to the record, so a closed course
  // refuses it for the same reason it refuses the tick itself.
  const module = await findModule(moduleId);
  const restriction = module
    ? await loadStudentRestriction(studentId, module.courseId ?? module.courseCode)
    : null;
  if (restriction) return refuseRestrictedCourse(response, restriction);

  await mongoose.connection
    .collection(PROGRESS_COLLECTION)
    .deleteOne({ studentId: String(studentId), moduleId: String(moduleId) });

  return response.json({ completed: false, moduleId });
}
