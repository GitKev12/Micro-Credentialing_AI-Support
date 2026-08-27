import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { syncAllAssessors } from "./enrollment.sync.js";

/**
 * Adding and removing a course's learning modules.
 *
 * The read side of this lives in admin.controller (`getCourse` lists a course's
 * modules); this file is the write side, and it is admin-only for the same
 * reason the rest of that router is — a lesson is course material, and who may
 * publish or withdraw it is not a student's decision.
 *
 * A module is two things stored apart: the PDF, which goes to the GridFS bucket
 * `LearningModule`, and a document in the `LearningModule` collection pointing
 * at it. Both are written here in the same shape the reader expects (see
 * modules.controller), because there are no Mongoose schemas in this project —
 * whatever is written is the shape, and a field spelled differently here would
 * simply be missing there.
 *
 * Removing one has to undo more than it created. A module accumulates derived
 * data as students use it: the cached text extraction, the figures cropped out
 * of its pages, its generated quiz, and every completion recorded against it.
 * None of that means anything without the lesson, so it all goes with it. The
 * Table of Specification is deliberately left alone — its rows are typed by an
 * admin, not derived, and silently editing someone's blueprint is not this
 * endpoint's business.
 */

const ASSESSMENTS_COLLECTION = "Assessment";
const ASSESSORS_COLLECTION = "Assessor";
const COURSES_COLLECTION = "Course";
const MODULES_COLLECTION = "LearningModule";
const MODULE_TEXT_COLLECTION = "ModuleText";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";
const STUDENTS_COLLECTION = "Student";
const TOS_COLLECTION = "TableOfSpecification";

const MODULES_BUCKET = "LearningModule";
const FIGURES_BUCKET = "ModuleFigure";
const COURSE_IMAGE_BUCKET = "CourseImage";

/**
 * The largest lesson file the API will take. Generous for a scanned chapter,
 * and low enough that the whole upload sitting in memory stays affordable —
 * express.raw() buffers it before this controller sees a byte.
 */
export const MAX_MODULE_BYTES = 40 * 1024 * 1024;

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

function serviceUnavailable(response) {
  return response.status(503).json({
    message: "The database is not connected. Set MONGODB_URI and restart the API."
  });
}

function courseCode(course) {
  return (course?.courseCode ?? course?.code ?? "").trim();
}

function bucketFor(name) {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: name });
}

/**
 * Whatever the browser sent, reduced to a plain file name ending in .pdf.
 *
 * The name is stored and later echoed in a Content-Disposition header, so a
 * path, a quote or a control character in it is worth dropping here rather
 * than discovering downstream.
 */
function safeFileName(name, fallback) {
  const base = String(name ?? "")
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f"]/g, "")
    .trim();

  const chosen = (base || fallback).slice(0, 180);
  return /\.pdf$/i.test(chosen) ? chosen : `${chosen}.pdf`;
}

/** The module as the admin screens read it — same fields `getCourse` returns. */
function publicModule(module) {
  return {
    id: asId(module._id),
    title: module.title ?? module.fileName ?? "Untitled module",
    fileName: module.fileName ?? "",
    fileSize: module.fileSize ?? null,
    uploadDate: module.uploadDate ?? null
  };
}

/** Matches a course's modules by id, falling back to the course code. */
function courseModuleFilter(course) {
  const code = courseCode(course);
  const clauses = [{ courseId: { $in: idCandidates(course._id) } }];
  // Only when the course actually has a code: `{ courseCode: "" }` would match
  // every module that was stored without one, whichever course it belongs to.
  if (code) clauses.push({ courseCode: code });
  return { $or: clauses };
}

function storeModuleFile(fileName, buffer, options) {
  return new Promise((resolve, reject) => {
    const upload = bucketFor(MODULES_BUCKET).openUploadStream(fileName, options);
    upload.on("error", reject);
    upload.on("finish", () => resolve(upload.id));
    upload.end(buffer);
  });
}

/**
 * POST /api/admin/courses/:id/modules
 *
 * The PDF arrives as the raw request body, with the title and file name on the
 * query string. That is unusual, and deliberate: the server has no multipart
 * parser and adding a dependency to carry one field beside a file buys nothing
 * — express.raw() reads this shape out of the box.
 */
export async function createCourseModule(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!course) return response.status(404).json({ message: "Course not found." });

  const file = Buffer.isBuffer(request.body) ? request.body : null;
  if (!file || file.length === 0) {
    return response.status(400).json({
      message: "Attach the lesson file as the request body."
    });
  }

  // Trust the bytes, not the declared type: the browser reports whatever the
  // file's extension suggests, and a renamed .pdf would sail past a header
  // check. Everything downstream — text extraction, figures, OCR — is a PDF
  // reader, so anything else only fails later, somewhere harder to explain.
  if (file.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return response.status(415).json({ message: "A learning module must be a PDF file." });
  }

  const fileName = safeFileName(request.query.fileName, "module.pdf");
  const title = String(request.query.title ?? "").trim() || fileName.replace(/\.pdf$/i, "");

  const duplicate = await collection(MODULES_COLLECTION).findOne({
    ...courseModuleFilter(course),
    title
  });
  if (duplicate) {
    return response.status(409).json({
      message: `This course already has a module titled "${title}".`
    });
  }

  const code = courseCode(course);
  const fileId = await storeModuleFile(fileName, file, {
    contentType: "application/pdf",
    metadata: { courseId: course._id, courseCode: code, title }
  });

  const document = {
    title,
    subject: code,
    fileName,
    fileType: "pdf",
    contentType: "application/pdf",
    fileSize: file.length,
    fileId,
    bucket: MODULES_BUCKET,
    uploadDate: new Date(),
    courseCode: code,
    courseId: course._id
  };

  let insertedId;
  try {
    ({ insertedId } = await collection(MODULES_COLLECTION).insertOne(document));
  } catch (error) {
    // The bytes are already in GridFS and nothing points at them now, so drop
    // the file rather than leave it behind as an orphan nobody will find.
    await bucketFor(MODULES_BUCKET)
      .delete(fileId)
      .catch(() => {});
    throw error;
  }

  return response.status(201).json({ module: publicModule({ ...document, _id: insertedId }) });
}

/**
 * GET /api/admin/modules/:moduleId/impact
 *
 * What deleting this lesson would take with it, counted before anything is
 * touched.
 *
 * The delete already reported this — afterwards. That is the wrong end of the
 * decision: a completion record is a student's evidence that they did the work,
 * and being told afterwards that thirty of them are gone is not consent. The
 * same counts, read before the confirmation, are what makes the confirmation
 * mean something.
 */
export async function getModuleImpact(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const module = await collection(MODULES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.moduleId) }
  });
  if (!module) return response.status(404).json({ message: "Learning module not found." });

  const byModule = { moduleId: { $in: idCandidates(module._id) } };

  const [assessments, completions, figures] = await Promise.all([
    collection(ASSESSMENTS_COLLECTION).countDocuments(byModule),
    collection(PROGRESS_COLLECTION).countDocuments(byModule),
    bucketFor(FIGURES_BUCKET)
      .find({ "metadata.moduleId": asId(module._id) })
      .toArray()
      .then((files) => files.length)
  ]);

  return response.json({
    impact: {
      id: asId(module._id),
      title: module.title ?? module.fileName ?? "Untitled module",
      assessments,
      completions,
      figures
    }
  });
}

/**
 * DELETE /api/admin/modules/:moduleId
 *
 * Reports what went with the lesson, so the console can tell the admin what
 * they actually removed instead of only that something was removed.
 */
/**
 * Removes one lesson and everything derived from it.
 *
 * Split out of the endpoint because deleting a course is this, once per lesson,
 * and a second copy of the cascade is a second chance to forget one of the five
 * places a module leaves something behind.
 */
async function purgeModule(module) {
  const moduleKey = asId(module._id);
  const byModule = { moduleId: { $in: idCandidates(module._id) } };

  // The lesson file. Older documents may name a different bucket, so follow
  // the one the module itself recorded.
  const bucketName = module.bucket ?? MODULES_BUCKET;
  if (module.fileId) {
    const bucket = bucketFor(bucketName);
    const files = await collection(`${bucketName}.files`)
      .find({ _id: { $in: idCandidates(module.fileId) } })
      .toArray();
    await Promise.all(files.map((file) => bucket.delete(file._id).catch(() => {})));
  }

  // The figures cropped out of its pages, tagged with the module's string id.
  const figures = bucketFor(FIGURES_BUCKET);
  const figureFiles = await figures.find({ "metadata.moduleId": moduleKey }).toArray();
  await Promise.all(figureFiles.map((file) => figures.delete(file._id).catch(() => {})));

  // The cached extraction is keyed on the string id too (modules.controller).
  await collection(MODULE_TEXT_COLLECTION).deleteMany({ moduleId: moduleKey });

  const quizzes = await collection(ASSESSMENTS_COLLECTION).deleteMany(byModule);
  const completions = await collection(PROGRESS_COLLECTION).deleteMany(byModule);

  await collection(MODULES_COLLECTION).deleteOne({ _id: module._id });

  return {
    figures: figureFiles.length,
    assessments: quizzes.deletedCount ?? 0,
    completions: completions.deletedCount ?? 0
  };
}

export async function deleteCourseModule(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const module = await collection(MODULES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.moduleId) }
  });
  if (!module) return response.status(404).json({ message: "Learning module not found." });

  const removed = await purgeModule(module);

  return response.json({
    removed: {
      id: asId(module._id),
      title: module.title ?? module.fileName ?? "Untitled module",
      ...removed
    }
  });
}

/* ─────────────────────────── Courses ─────────────────────────── */

/**
 * The catalog itself.
 *
 * A course could not be created from the console at all — every one of them
 * began as a hand-written document — and could not be renamed or deleted
 * either. These are the endpoints behind that, and they live beside the module
 * writes because removing a course is removing its lessons, which is work this
 * file already knows how to do.
 */

/** The course as the admin list renders it. */
function publicCourse(course, counts = {}) {
  return {
    id: asId(course._id),
    code: courseCode(course),
    title: course.courseName ?? course.title ?? course.name ?? "",
    description: course.description ?? "",
    hasImage: Boolean(course.imageFileId),
    moduleCount: counts.moduleCount ?? 0,
    studentCount: counts.studentCount ?? 0
  };
}

/** POST /api/admin/courses — { code, title, description } */
export async function createCourse(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const body = request.body ?? {};
  const code = String(body.code ?? "").trim();
  const title = String(body.title ?? "").trim();

  if (!code) return response.status(400).json({ message: "A course code is required." });
  if (!title) return response.status(400).json({ message: "A course title is required." });

  // Codes are how modules, blueprints and badges find their course when they
  // were not stored with an id, so two courses sharing one would quietly pull
  // each other's material.
  const existing = await collection(COURSES_COLLECTION).findOne({
    $or: [{ courseCode: code }, { code }]
  });
  if (existing) {
    return response.status(409).json({ message: `A course with the code "${code}" already exists.` });
  }

  const document = {
    courseCode: code,
    courseName: title,
    description: String(body.description ?? "").trim(),
    createdAt: new Date()
  };

  const { insertedId } = await collection(COURSES_COLLECTION).insertOne(document);

  return response
    .status(201)
    .json({ course: publicCourse({ ...document, _id: insertedId }) });
}

/** PATCH /api/admin/courses/:id — { code?, title?, description? } */
export async function updateCourse(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!course) return response.status(404).json({ message: "Course not found." });

  const body = request.body ?? {};
  const updates = {};

  if ("title" in body) {
    const title = String(body.title ?? "").trim();
    if (!title) return response.status(400).json({ message: "A course title is required." });
    updates.courseName = title;
  }

  if ("description" in body) updates.description = String(body.description ?? "").trim();

  if ("code" in body) {
    const code = String(body.code ?? "").trim();
    if (!code) return response.status(400).json({ message: "A course code is required." });

    if (code !== courseCode(course)) {
      const clash = await collection(COURSES_COLLECTION).findOne({
        _id: { $ne: course._id },
        $or: [{ courseCode: code }, { code }]
      });
      if (clash) {
        return response.status(409).json({ message: `A course with the code "${code}" already exists.` });
      }

      // Modules, badges and blueprints written without a courseId find their
      // course by code. Renaming the code without carrying them across would
      // strand exactly those rows.
      await collection(MODULES_COLLECTION).updateMany(
        { courseCode: courseCode(course) },
        { $set: { courseCode: code, subject: code } }
      );
      updates.courseCode = code;
    }
  }

  if (Object.keys(updates).length === 0) {
    return response.status(400).json({ message: "Send at least one of code, title or description." });
  }

  await collection(COURSES_COLLECTION).updateOne({ _id: course._id }, { $set: updates });

  return response.json({ course: publicCourse({ ...course, ...updates }) });
}

/** Everything that hangs off a course, counted or collected. */
async function courseContents(course) {
  const modules = await collection(MODULES_COLLECTION).find(courseModuleFilter(course)).toArray();
  const byCourse = { courseId: { $in: idCandidates(course._id) } };

  const countIn = async (name, filter) =>
    (await collectionExists(name)) ? collection(name).countDocuments(filter) : 0;

  const enrolled = await collection(STUDENTS_COLLECTION).countDocuments({
    enrolledCourses: { $in: idCandidates(course._id) }
  });

  const assessors = await collection(ASSESSORS_COLLECTION).countDocuments({
    assigned_courses: { $in: idCandidates(course._id) }
  });

  const [submissions, completions, blueprints] = await Promise.all([
    countIn(RESULTS_COLLECTION, byCourse),
    countIn(PROGRESS_COLLECTION, byCourse),
    countIn(TOS_COLLECTION, { courseId: asId(course._id) })
  ]);

  return { modules, enrolled, assessors, submissions, completions, blueprints };
}

/** GET /api/admin/courses/:id/impact — what deleting this course destroys. */
export async function getCourseImpact(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!course) return response.status(404).json({ message: "Course not found." });

  const contents = await courseContents(course);

  return response.json({
    impact: {
      id: asId(course._id),
      title: course.courseName ?? course.title ?? "",
      modules: contents.modules.length,
      enrolled: contents.enrolled,
      assessors: contents.assessors,
      submissions: contents.submissions,
      completions: contents.completions,
      blueprints: contents.blueprints
    }
  });
}

/**
 * DELETE /api/admin/courses/:id
 *
 * The heaviest thing in the console, so it reports every category it touched.
 * Enrolments and assignments are withdrawn rather than deleted — the student
 * and the assessor are not the course's to remove.
 */
export async function deleteCourse(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!course) return response.status(404).json({ message: "Course not found." });

  const contents = await courseContents(course);
  const byCourse = { courseId: { $in: idCandidates(course._id) } };

  // Lessons first, each taking its file, figures, text, quiz and completions.
  for (const module of contents.modules) {
    await purgeModule(module);
  }

  const removeMany = async (name, filter) => {
    if (!(await collectionExists(name))) return 0;
    const result = await collection(name).deleteMany(filter);
    return result.deletedCount ?? 0;
  };

  // The final exam and any submission that survived its lesson being removed.
  const assessments = await removeMany(ASSESSMENTS_COLLECTION, byCourse);
  const submissions = await removeMany(RESULTS_COLLECTION, byCourse);
  await removeMany(PROGRESS_COLLECTION, byCourse);
  const blueprints = await removeMany(TOS_COLLECTION, { courseId: asId(course._id) });

  // The people keep their accounts; they simply are not in this course now.
  const enrolments = await collection(STUDENTS_COLLECTION).updateMany(
    { enrolledCourses: { $in: idCandidates(course._id) } },
    { $pull: { enrolledCourses: { $in: idCandidates(course._id) } } }
  );
  const assignments = await collection(ASSESSORS_COLLECTION).updateMany(
    { assigned_courses: { $in: idCandidates(course._id) } },
    { $pull: { assigned_courses: { $in: idCandidates(course._id) } } }
  );

  if (course.imageFileId) {
    await bucketFor(COURSE_IMAGE_BUCKET)
      .delete(course.imageFileId)
      .catch(() => {});
  }

  await collection(COURSES_COLLECTION).deleteOne({ _id: course._id });

  // Rosters are derived from enrolment, and the enrolment just changed.
  await syncAllAssessors();

  return response.json({
    removed: {
      id: asId(course._id),
      title: course.courseName ?? course.title ?? "",
      modules: contents.modules.length,
      assessments,
      submissions,
      completions: contents.completions,
      blueprints,
      unenrolled: enrolments.modifiedCount ?? 0,
      unassigned: assignments.modifiedCount ?? 0
    }
  });
}
