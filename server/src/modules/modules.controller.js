import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { toAssessmentSummary } from "../assessments/assessments.format.js";
import {
  findCourse,
  lessonsHiddenFrom,
  lessonsHiddenFromStudent,
  loadClassSuspension,
  loadStudentRestriction,
  refuseRestrictedCourse,
  toCourseAccess
} from "../lib/courseAccess.js";
import { findModuleFile } from "./moduleFile.js";
import { queueModuleExtraction, readModuleText } from "./extraction/extractionJobs.js";
import { sortLessons } from "../lib/lessonOrder.js";
import { lessonLockFor, loadLessonLocks } from "../lib/lessonLocks.js";

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
const COURSES_COLLECTION = "Course";
const COURSE_IMAGES_BUCKET = "CourseImage";

// A lesson's text is prepared in the background after upload and kept in
// ModuleText (see extraction/extractionJobs.js). These routes only read it.

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
 * Turns a lesson route away, for either of the two reasons a lesson may not be
 * this reader's to open. The refusal comes before the file is read or its text
 * extracted, which is the expensive half.
 *
 * A switched-off class closes lessons that were open, and says so with the 423
 * the reader knows how to explain. An assess-only pathway never had them: its
 * candidate is examined on competence they already hold, and this material is
 * the taught section's. That one answers exactly as a lesson which does not
 * exist answers — the same 404 a paper written for another class gives — so
 * there is nothing here to explain and nothing to go looking for.
 *
 * Returns the sent response when it refused, and null when the route may carry
 * on, so a handler reads as `if (refused) return refused;`.
 */
async function refuseLesson(request, response, module) {
  const courseRef = module.courseId ?? module.courseCode;

  const suspension = await viewerSuspension(request, courseRef);
  if (suspension) return refuseRestrictedCourse(response, suspension);

  if (await lessonsHiddenFrom(request.session, courseRef)) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  // Lessons open one at a time: the previous lesson's exam must be passed.
  if (request.session?.role === "student") {
    const reason = await lessonLockFor(request.session.id, module);
    if (reason) return response.status(423).json({ message: reason, locked: true });
  }

  return null;
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

  // An assess-only candidate has no lessons on their pathway. The course still
  // comes back — they are on it, and the screen has to name what it is showing
  // — but the curriculum is not theirs to read, and `assessOnly` is how the
  // reader knows to say so rather than draw an empty rail it cannot explain.
  if (await lessonsHiddenFrom(request.session, found ?? courseId)) {
    return response.json({ course, modules: [], assessOnly: true });
  }

  if (!(await collectionExists(MODULES_COLLECTION))) {
    return response.json({ course, modules: [], pending: true });
  }

  const modules = await mongoose.connection
    .collection(MODULES_COLLECTION)
    .find(courseMatch(courseId))
    .toArray();

  sortLessons(modules);

  // For a student, each lesson says whether it is open yet and why not.
  const locks =
    request.session?.role === "student"
      ? await loadLessonLocks(request.session.id, found ?? courseId, modules)
      : new Map();

  return response.json({
    course,
    modules: modules.map((module) => {
      const reason = locks.get(String(module._id)) ?? null;
      return { ...toPublicModule(module), locked: Boolean(reason), lockReason: reason };
    })
  });
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

export async function getModuleFile(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const refused = await refuseLesson(request, response, module);
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

function toTextResponse(record) {
  return {
    id: record.moduleId,
    status: "ready",
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
    cached: true
  };
}

/**
 * The answer for a lesson that isn't ready to read yet.
 *
 *   queued / extracting → 202, and the reader asks again shortly
 *   failed              → 200 with status "failed", so the reader can say so
 */
function sendNotReady(response, module, status) {
  const body = { id: String(module._id), title: module.title ?? "", status };

  if (status === "failed") {
    return response.json({ ...body, message: "This lesson couldn't be prepared." });
  }

  response.set("Retry-After", "3");
  return response.status(202).json({ ...body, message: "This lesson is being prepared." });
}

export async function getModuleText(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const refused = await refuseLesson(request, response, module);
  if (refused) return refused;

  const { status, record } = await readModuleText(module);
  if (status === "ready") return response.json(toTextResponse(record));

  // Not ready: make sure its job is queued, then answer straight away. The
  // extraction itself never runs inside this request.
  const queuedStatus = await queueModuleExtraction(module);
  return sendNotReady(response, module, queuedStatus);
}

// Lightweight section list for the curriculum dropdown — same cache, no blocks.
// It never queues a job: the rail asks for many lessons at once, and only
// opening a lesson should start its preparation.
export async function getModuleSections(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const refused = await refuseLesson(request, response, module);
  if (refused) return refused;

  const { status, record } = await readModuleText(module);
  if (status !== "ready") {
    return response.status(202).json({
      id: String(module._id),
      title: module.title ?? "",
      status,
      hasText: false,
      sections: []
    });
  }

  return response.json({
    id: record.moduleId,
    status: "ready",
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
  const refused = module ? await refuseLesson(request, response, module) : null;
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

  // Nothing is finished on a pathway that never had it to read. Refused the
  // same way the lesson itself is, so a stale tab cannot write progress
  // against a curriculum this candidate is not on.
  if (await lessonsHiddenFromStudent(request.params.studentId, module.courseId ?? module.courseCode)) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  // A lesson still locked behind the previous exam can't be finished either.
  const lockReason = await lessonLockFor(request.params.studentId, module);
  if (lockReason) return response.status(423).json({ message: lockReason, locked: true });

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

  // Finishing the lesson is one of the two gates on its quiz; the other is the
  // assessor's, and it is the one that decides whether a paper exists at all.
  // Nothing is written here — a student cannot cause a model call — see the
  // assessor console's Generate Assessment screen.
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

  if (module && (await lessonsHiddenFromStudent(studentId, module.courseId ?? module.courseCode))) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  await mongoose.connection
    .collection(PROGRESS_COLLECTION)
    .deleteOne({ studentId: String(studentId), moduleId: String(moduleId) });

  return response.json({ completed: false, moduleId });
}
