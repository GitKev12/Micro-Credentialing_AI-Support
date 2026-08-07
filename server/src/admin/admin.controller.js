import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { blueprintFromTos } from "../assessments/assessments.blueprint.js";
import { syncAssessor, syncAssessorsForCourse } from "./enrollment.sync.js";

/**
 * Admin console endpoints — courses, students, assessors and the Table of
 * Specification.
 *
 * These read the live MainSystemDB collections. A few fields the admin
 * screens display are not stored anywhere yet (a student's program/year, an
 * assessor's department); rather than invent values those come back as null
 * so the UI can render a placeholder. Everything else is either read straight
 * from a document or derived from real data:
 *
 *   course.moduleCount   <- LearningModule documents for that course
 *   course.studentCount  <- Students whose enrolledCourses contains it
 *   student.progress     <- ModuleProgress completions vs. modules per course
 *   assessor.students    <- assigned_students on the Assessor document
 */
const ADMIN_COLLECTION = "Admin";
const ASSESSORS_COLLECTION = "Assessor";
const COURSES_COLLECTION = "Course";
const MODULES_COLLECTION = "LearningModule";
const PROGRESS_COLLECTION = "ModuleProgress";
const STUDENTS_COLLECTION = "Student";
const TOS_COLLECTION = "TableOfSpecification";

const collection = (name) => mongoose.connection.collection(name);

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

function serviceUnavailable(response) {
  return response.status(503).json({
    message: "The database is not connected. Set MONGODB_URI and restart the API."
  });
}

const asId = (value) => String(value);

function courseTitle(course) {
  return course?.courseName ?? course?.title ?? course?.name ?? "";
}

function courseCode(course) {
  return (course?.courseCode ?? course?.code ?? "").trim();
}

function studentName(student) {
  const full = [student?.first_name, student?.last_name].filter(Boolean).join(" ").trim();
  return full || student?.full_name || student?.name || student?.email || "Unnamed student";
}

/** Courses keyed by their string id, for resolving enrollment references. */
async function courseMap() {
  const courses = await collection(COURSES_COLLECTION).find().toArray();
  return new Map(courses.map((course) => [asId(course._id), course]));
}

/* ─────────────────────────── Courses ─────────────────────────── */

export async function listCourses(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const courses = await collection(COURSES_COLLECTION).find().toArray();

  // Module counts per course, in one pass.
  const moduleCounts = new Map();
  if (await collectionExists(MODULES_COLLECTION)) {
    const grouped = await collection(MODULES_COLLECTION)
      .aggregate([{ $group: { _id: "$courseId", count: { $sum: 1 } } }])
      .toArray();
    grouped.forEach((row) => moduleCounts.set(asId(row._id), row.count));
  }

  // Enrollment counts per course, derived from Student.enrolledCourses.
  const studentCounts = new Map();
  const students = await collection(STUDENTS_COLLECTION)
    .find({}, { projection: { enrolledCourses: 1 } })
    .toArray();
  students.forEach((student) => {
    (student.enrolledCourses ?? []).forEach((courseId) => {
      const key = asId(courseId);
      studentCounts.set(key, (studentCounts.get(key) ?? 0) + 1);
    });
  });

  return response.json({
    courses: courses.map((course) => ({
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course),
      description: course.description ?? "",
      hasImage: Boolean(course.imageFileId),
      moduleCount: moduleCounts.get(asId(course._id)) ?? 0,
      studentCount: studentCounts.get(asId(course._id)) ?? 0
    }))
  });
}

export async function getCourse(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });

  if (!course) return response.status(404).json({ message: "Course not found." });

  const modules = await collection(MODULES_COLLECTION)
    .find({
      $or: [
        { courseId: { $in: idCandidates(course._id) } },
        { courseCode: courseCode(course) }
      ]
    })
    .sort({ title: 1 })
    .toArray();

  return response.json({
    course: {
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course),
      description: course.description ?? "",
      modules: modules.map((module) => ({
        id: asId(module._id),
        title: module.title ?? module.fileName ?? "Untitled module",
        fileName: module.fileName ?? "",
        fileSize: module.fileSize ?? null
      }))
    }
  });
}

/* ─────────────────────────── Students ─────────────────────────── */

/** Completed-module counts per course for one student. */
async function progressForStudent(student, courses) {
  const enrolled = student.enrolledCourses ?? [];
  if (enrolled.length === 0) return [];

  const completed = await collection(PROGRESS_COLLECTION)
    .find({ studentId: { $in: idCandidates(student._id) } })
    .toArray();

  const completedByCourse = new Map();
  completed.forEach((entry) => {
    const key = asId(entry.courseId);
    completedByCourse.set(key, (completedByCourse.get(key) ?? 0) + 1);
  });

  const rows = [];
  for (const courseId of enrolled) {
    const key = asId(courseId);
    const course = courses.get(key);
    if (!course) continue;

    const total = await collection(MODULES_COLLECTION).countDocuments({
      $or: [{ courseId: { $in: idCandidates(courseId) } }, { courseCode: courseCode(course) }]
    });
    const done = completedByCourse.get(key) ?? 0;

    rows.push({
      label: courseTitle(course),
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      completed: done,
      total
    });
  }
  return rows;
}

function publicStudent(student, courses) {
  const enrolled = (student.enrolledCourses ?? [])
    .map((courseId) => courses.get(asId(courseId)))
    .filter(Boolean)
    .map((course) => ({
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course)
    }));

  return {
    id: asId(student._id),
    studentNumber: student.student_id ?? null,
    name: studentName(student),
    email: student.email ?? null,
    // Not stored on the Student document yet.
    program: student.program ?? null,
    year: student.year ?? null,
    status: student.status ?? "Active",
    enrolled
  };
}

export async function listStudents(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const [students, courses] = await Promise.all([
    collection(STUDENTS_COLLECTION).find().sort({ last_name: 1 }).toArray(),
    courseMap()
  ]);

  return response.json({ students: students.map((s) => publicStudent(s, courses)) });
}

export async function getStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!student) return response.status(404).json({ message: "Student not found." });

  const courses = await courseMap();
  const progress = await progressForStudent(student, courses);

  // A micro-credential is awarded when every module of a course is done.
  const credentials = progress.filter((row) => row.total > 0 && row.pct === 100).length;

  return response.json({
    student: { ...publicStudent(student, courses), progress, credentials }
  });
}

export async function enrollStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { courseId } = request.body ?? {};
  if (!courseId) return response.status(400).json({ message: "courseId is required." });

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(courseId) }
  });
  if (!course) return response.status(404).json({ message: "Course not found." });

  const result = await collection(STUDENTS_COLLECTION).updateOne(
    { _id: { $in: idCandidates(request.params.id) } },
    { $addToSet: { enrolledCourses: course._id } }
  );
  if (result.matchedCount === 0) {
    return response.status(404).json({ message: "Student not found." });
  }

  // The course's assessors now have one more student on their roster.
  await syncAssessorsForCourse(course._id);

  return getStudent(request, response);
}

export async function unenrollStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const result = await collection(STUDENTS_COLLECTION).updateOne(
    { _id: { $in: idCandidates(request.params.id) } },
    { $pull: { enrolledCourses: { $in: idCandidates(request.params.courseId) } } }
  );
  if (result.matchedCount === 0) {
    return response.status(404).json({ message: "Student not found." });
  }

  // Run after the pull, so the recomputed roster reflects the course they left
  // — while keeping them on any assessor who also teaches a course they remain
  // enrolled in.
  await syncAssessorsForCourse(request.params.courseId);

  return getStudent(request, response);
}

/* ─────────────────────────── Assessors ─────────────────────────── */

function publicAssessor(assessor, courses) {
  const assigned = (assessor.assigned_courses ?? [])
    .map((courseId) => courses.get(asId(courseId)))
    .filter(Boolean)
    .map((course) => ({
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course),
      section: courseCode(course)
    }));

  return {
    id: asId(assessor._id),
    assessorNumber: assessor.assessor_id ?? null,
    name: assessor.full_name ?? assessor.name ?? assessor.email ?? "Unnamed assessor",
    email: assessor.email ?? null,
    // Not stored on the Assessor document yet.
    department: assessor.department ?? null,
    status: assessor.status ?? "Active",
    students: (assessor.assigned_students ?? []).length,
    assigned
  };
}

export async function listAssessors(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const [assessors, courses] = await Promise.all([
    collection(ASSESSORS_COLLECTION).find().sort({ full_name: 1 }).toArray(),
    courseMap()
  ]);

  return response.json({ assessors: assessors.map((a) => publicAssessor(a, courses)) });
}

export async function getAssessor(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await collection(ASSESSORS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  return response.json({ assessor: publicAssessor(assessor, await courseMap()) });
}

export async function assignCourse(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { courseId } = request.body ?? {};
  if (!courseId) return response.status(400).json({ message: "courseId is required." });

  const course = await collection(COURSES_COLLECTION).findOne({
    _id: { $in: idCandidates(courseId) }
  });
  if (!course) return response.status(404).json({ message: "Course not found." });

  const result = await collection(ASSESSORS_COLLECTION).updateOne(
    { _id: { $in: idCandidates(request.params.id) } },
    { $addToSet: { assigned_courses: course._id } }
  );
  if (result.matchedCount === 0) {
    return response.status(404).json({ message: "Assessor not found." });
  }

  // Taking on a course means taking on everyone already enrolled in it.
  await syncAssessor(request.params.id);

  return getAssessor(request, response);
}

export async function unassignCourse(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const result = await collection(ASSESSORS_COLLECTION).updateOne(
    { _id: { $in: idCandidates(request.params.id) } },
    { $pull: { assigned_courses: { $in: idCandidates(request.params.courseId) } } }
  );
  if (result.matchedCount === 0) {
    return response.status(404).json({ message: "Assessor not found." });
  }

  // Dropping a course drops its students, unless another of their courses
  // keeps them on this assessor's roster.
  await syncAssessor(request.params.id);

  return getAssessor(request, response);
}

/* ──────────────────── Table of Specification ──────────────────── */

const LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

function toCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function publicTosRow(row) {
  const clean = { course: String(row?.course ?? ""), hours: toCount(row?.hours) };
  LEVELS.forEach((level) => {
    clean[level] = toCount(row?.[level]);
  });
  // The row's item count is the sum of its levels — carried so callers don't
  // each re-derive the one number the row exists to state.
  clean.items = LEVELS.reduce((sum, level) => sum + clean[level], 0);

  // `course` holds the coverage topic — a lesson title, which anyone may
  // retype here. The moduleId says which lesson that row actually covers, and
  // is preserved rather than rebuilt: a save round-trips rows through the
  // admin form, and anything dropped here is lost from the blueprint.
  if (row?.moduleId) clean.moduleId = String(row.moduleId);

  return clean;
}

function publicTos(doc) {
  return {
    id: asId(doc._id),
    courseId: doc.courseId ? String(doc.courseId) : null,
    courseCode: doc.courseCode ?? "",
    examination: doc.examination ?? "",
    rows: Array.isArray(doc.rows) ? doc.rows.map(publicTosRow) : [],
    // What the rows mean for quiz generation, derived rather than stored so it
    // can never drift from the rows beside it.
    blueprint: blueprintFromTos(doc)
  };
}

/**
 * Every course's blueprint — one document per course, its rows being that
 * course's lessons.
 *
 * These endpoints once read a single document with no course filter, so with
 * several stored the screen showed, and a save overwrote, whichever happened
 * to sort first. Both are keyed on courseId now.
 */
export async function getTableOfSpecification(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  // The collection may not exist yet — respond with an empty list rather than
  // failing, same "abang" behaviour as the student endpoints.
  if (!(await collectionExists(TOS_COLLECTION))) {
    return response.json({ blueprints: [], pending: true });
  }

  const docs = await collection(TOS_COLLECTION).find({}).toArray();
  const blueprints = docs
    .map(publicTos)
    .sort((left, right) => left.examination.localeCompare(right.examination, "en"));

  return response.json({ blueprints, pending: blueprints.length === 0 });
}

export async function saveTableOfSpecification(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { courseId, examination, rows } = request.body ?? {};
  if (!Array.isArray(rows)) {
    return response.status(400).json({ message: "rows must be an array." });
  }
  // Without this a save has no course to land on, and would fall back to
  // overwriting an arbitrary one — the failure this endpoint used to have.
  if (!courseId) {
    return response.status(400).json({ message: "courseId is required." });
  }

  const payload = {
    examination: String(examination ?? "").trim(),
    rows: rows.map(publicTosRow),
    updatedAt: new Date()
  };

  await collection(TOS_COLLECTION).updateOne(
    { courseId: String(courseId) },
    { $set: payload, $setOnInsert: { courseId: String(courseId), createdAt: new Date() } },
    { upsert: true }
  );

  return getTableOfSpecification(request, response);
}

/* ─────────────────────────── Profile ─────────────────────────── */

export async function getAdminProfile(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const admin = await collection(ADMIN_COLLECTION).findOne();

  return response.json({
    admin: {
      name: admin?.name ?? "Administrator",
      idNumber: admin?.admin_id ?? "",
      email: admin?.email ?? null
    }
  });
}
