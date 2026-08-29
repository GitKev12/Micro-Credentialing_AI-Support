import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { syncAssessorsForCourse } from "./enrollment.sync.js";

/**
 * Classes — one row tying a course to the assessors and students in it, plus a
 * schedule. It is how an admin builds a section in a single place instead of
 * enrolling students on one screen and assigning assessors on another.
 *
 * A Class does not become a new source of truth. Everything the rest of the app
 * reads — the student dashboard, the skill gap, the assessor console, the other
 * admin screens — still reads `Student.enrolledCourses` and
 * `Assessor.assigned_courses`. Saving a class *writes through* to those fields
 * and then rebuilds assessor rosters (enrollment.sync.js), so the class is a
 * management surface layered over the existing model, not a replacement for it.
 *
 * The `schedule` is a stored label only: `{ days, time, room }`, shown on
 * the class and nowhere enforced. Quizzes still open per student when they
 * finish a lesson — this system has no schedule-driven release, and a class does
 * not introduce one.
 *
 *   Class { _id, name, courseId, assessorIds[], studentIds[], active,
 *           schedule: { days, time, room }, createdAt, updatedAt }
 *
 * `active` is the one field here the rest of the app reads. An inactive class
 * keeps its roster and its people keep the course, but its students lose the
 * course material: the lessons, the quizzes and the tick that completes a
 * lesson are all refused while the switch is off (see lib/courseAccess.js).
 * A student held by a second, still-active class on the same course keeps it —
 * the same reasoning `inAnotherClass` uses when a class is deleted. The
 * schedule stays a label, and still gates nothing.
 *
 * Ids are stored the way the rest of the data stores them — a resolved
 * document's `_id`, verbatim — and read back with `idCandidates` so a value
 * saved as an ObjectId or a string both match.
 */
const CLASSES_COLLECTION = "Class";
const COURSES_COLLECTION = "Course";
const ASSESSORS_COLLECTION = "Assessor";
const STUDENTS_COLLECTION = "Student";

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

function courseTitle(course) {
  return course?.courseName ?? course?.title ?? course?.name ?? "";
}

function courseCode(course) {
  return (course?.courseCode ?? course?.code ?? "").trim();
}

/** A person's display name, for either a student or an assessor document. */
function personName(person) {
  const full = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  return full || person?.full_name || person?.name || person?.email || "Unnamed";
}

/** The schedule reduced to three trimmed strings — a label, never enforced. */
function cleanSchedule(schedule) {
  const source = schedule ?? {};
  const field = (value) => String(value ?? "").trim();
  return {
    days: field(source.days),
    time: field(source.time),
    room: field(source.room)
  };
}

/** Set difference by string id, keeping the original id values on each side. */
function diffIds(before, after) {
  const beforeSet = new Set(before.map(asId));
  const afterSet = new Set(after.map(asId));
  return {
    added: after.filter((id) => !beforeSet.has(asId(id))),
    removed: before.filter((id) => !afterSet.has(asId(id)))
  };
}

async function resolveCourse(courseId) {
  if (!courseId) return null;
  return collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(courseId) } });
}

/** The existing documents for a list of ids — silently drops any that are gone. */
async function resolveMany(collectionName, ids) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.length === 0) return [];
  const candidates = list.flatMap((id) => idCandidates(id));
  return collection(collectionName).find({ _id: { $in: candidates } }).toArray();
}

/**
 * Is this person still a member of some *other* class on the same course?
 *
 * The course link is shared: two classes can teach the same course, and a
 * student may also have been enrolled straight from the Students screen.
 * Removing someone from one class must not pull an enrolment another class (or a
 * direct enrolment) still stands on, so a removal is only carried through when
 * no other class keeps it.
 */
async function inAnotherClass(personId, courseId, exceptClassId, memberField) {
  const query = {
    courseId: { $in: idCandidates(courseId) },
    [memberField]: { $in: idCandidates(personId) }
  };
  if (exceptClassId) query._id = { $nin: idCandidates(exceptClassId) };
  return (await collection(CLASSES_COLLECTION).countDocuments(query)) > 0;
}

/** Add the course to each person's course list. */
async function linkToCourse(collectionName, field, personIds, courseId) {
  if (personIds.length === 0) return;
  await collection(collectionName).updateMany(
    { _id: { $in: personIds.flatMap((id) => idCandidates(id)) } },
    { $addToSet: { [field]: courseId } }
  );
}

/**
 * Remove the course from each person — unless another class still holds them.
 *
 * Returns the ids it actually unlinked, which is what the log records: someone
 * kept by a second class was not removed from the course, and saying otherwise
 * in the history would be worse than saying nothing.
 */
async function unlinkFromCourse(collectionName, field, personIds, courseId, memberField, exceptClassId) {
  const removed = [];

  for (const personId of personIds) {
    if (await inAnotherClass(personId, courseId, exceptClassId, memberField)) continue;
    await collection(collectionName).updateOne(
      { _id: { $in: idCandidates(personId) } },
      { $pull: { [field]: { $in: idCandidates(courseId) } } }
    );
    removed.push(personId);
  }

  return removed;
}

/** One class joined to its course, assessors and students, for the detail view. */
async function buildClassDetail(cls) {
  const [course, assessors, students] = await Promise.all([
    resolveCourse(cls.courseId),
    resolveMany(ASSESSORS_COLLECTION, cls.assessorIds ?? []),
    resolveMany(STUDENTS_COLLECTION, cls.studentIds ?? [])
  ]);

  const byName = (a, b) => personName(a).localeCompare(personName(b));

  return {
    id: asId(cls._id),
    name: cls.name ?? "",
    course: course ? { id: asId(course._id), code: courseCode(course), title: courseTitle(course) } : null,
    assessors: assessors.sort(byName).map((a) => ({ id: asId(a._id), name: personName(a) })),
    students: students.sort(byName).map((s) => ({
      id: asId(s._id),
      name: personName(s),
      studentNumber: s.student_id ?? null
    })),
    schedule: cleanSchedule(cls.schedule),
    active: cls.active !== false,
    createdAt: cls.createdAt ?? null,
    updatedAt: cls.updatedAt ?? null
  };
}

/** A list row — built from preloaded maps so the list is one pass, not N queries. */
function publicClassRow(cls, { courseById, assessorById }) {
  const course = courseById.get(asId(cls.courseId));
  const assessors = (cls.assessorIds ?? [])
    .map((id) => assessorById.get(asId(id)))
    .filter(Boolean)
    .map((a) => ({ id: asId(a._id), name: personName(a) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: asId(cls._id),
    name: cls.name ?? "",
    course: course ? { id: asId(course._id), code: courseCode(course), title: courseTitle(course) } : null,
    assessors,
    studentCount: (cls.studentIds ?? []).length,
    schedule: cleanSchedule(cls.schedule),
    // Absent on every class written before the field existed, and those were
    // all running — so missing reads as active, and only an explicit false
    // turns it off.
    active: cls.active !== false,
    createdAt: cls.createdAt ?? null
  };
}

async function respondWithClass(id, response) {
  const cls = await collection(CLASSES_COLLECTION).findOne({ _id: { $in: idCandidates(id) } });
  if (!cls) return response.status(404).json({ message: "Class not found." });
  return response.json({ class: await buildClassDetail(cls) });
}

/* ─────────────────────────────── Reads ─────────────────────────────── */

export async function listClasses(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);
  if (!(await collectionExists(CLASSES_COLLECTION))) return response.json({ classes: [] });

  const [classes, courses, assessors] = await Promise.all([
    collection(CLASSES_COLLECTION).find().sort({ createdAt: -1 }).toArray(),
    collection(COURSES_COLLECTION).find().toArray(),
    collection(ASSESSORS_COLLECTION).find().toArray()
  ]);

  const courseById = new Map(courses.map((course) => [asId(course._id), course]));
  const assessorById = new Map(assessors.map((assessor) => [asId(assessor._id), assessor]));

  return response.json({
    classes: classes.map((cls) => publicClassRow(cls, { courseById, assessorById }))
  });
}

export async function getClass(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);
  return respondWithClass(request.params.id, response);
}

/**
 * What removing this class would touch, read before the confirm is agreed to.
 *
 * A class delete removes no accounts — it unenrols its students and unassigns
 * its assessors from the course, and only those the class is the *last* one
 * holding. Everyone else keeps the link a second class or a direct enrolment
 * gives them, so the counts here are the ones actually about to change.
 */
export async function getClassImpact(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const cls = await collection(CLASSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!cls) return response.status(404).json({ message: "Class not found." });

  let unenroll = 0;
  for (const studentId of cls.studentIds ?? []) {
    if (!(await inAnotherClass(studentId, cls.courseId, cls._id, "studentIds"))) unenroll += 1;
  }
  let unassign = 0;
  for (const assessorId of cls.assessorIds ?? []) {
    if (!(await inAnotherClass(assessorId, cls.courseId, cls._id, "assessorIds"))) unassign += 1;
  }

  const course = await resolveCourse(cls.courseId);

  return response.json({
    impact: {
      id: asId(cls._id),
      name: cls.name ?? "",
      course: course ? `${courseCode(course)} · ${courseTitle(course)}`.trim() : "",
      students: (cls.studentIds ?? []).length,
      assessors: (cls.assessorIds ?? []).length,
      unenroll,
      unassign
    }
  });
}

/* ─────────────────────────────── Writes ────────────────────────────── */

export async function createClass(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const body = request.body ?? {};
  const name = String(body.name ?? "").trim();
  if (!name) return response.status(400).json({ message: "A class name is required." });

  const course = await resolveCourse(body.courseId);
  if (!course) return response.status(400).json({ message: "Choose a course for this class." });

  const assessorDocs = await resolveMany(ASSESSORS_COLLECTION, body.assessorIds);
  const studentDocs = await resolveMany(STUDENTS_COLLECTION, body.studentIds);
  const assessorIds = assessorDocs.map((doc) => doc._id);
  const studentIds = studentDocs.map((doc) => doc._id);

  const now = new Date();
  const document = {
    name,
    courseId: course._id,
    assessorIds,
    studentIds,
    schedule: cleanSchedule(body.schedule),
    active: body.active !== false,
    createdAt: now,
    updatedAt: now
  };

  const { insertedId } = await collection(CLASSES_COLLECTION).insertOne(document);

  // Write through: everyone in the class gains the course, then rosters rebuild.
  await linkToCourse(STUDENTS_COLLECTION, "enrolledCourses", studentIds, course._id);
  await linkToCourse(ASSESSORS_COLLECTION, "assigned_courses", assessorIds, course._id);
  await syncAssessorsForCourse(course._id);

  return respondWithClass(insertedId, response);
}

export async function updateClass(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const cls = await collection(CLASSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!cls) return response.status(404).json({ message: "Class not found." });

  const body = request.body ?? {};
  const updates = {};

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return response.status(400).json({ message: "A class name is required." });
    updates.name = name;
  }

  let newCourse = null;
  if ("courseId" in body) {
    newCourse = await resolveCourse(body.courseId);
    if (!newCourse) return response.status(400).json({ message: "Choose a course for this class." });
    updates.courseId = newCourse._id;
  }

  if ("assessorIds" in body) {
    updates.assessorIds = (await resolveMany(ASSESSORS_COLLECTION, body.assessorIds)).map((d) => d._id);
  }
  if ("studentIds" in body) {
    updates.studentIds = (await resolveMany(STUDENTS_COLLECTION, body.studentIds)).map((d) => d._id);
  }
  if ("schedule" in body) updates.schedule = cleanSchedule(body.schedule);
  if ("active" in body) updates.active = body.active !== false;

  const oldCourseId = cls.courseId;
  const newCourseId = updates.courseId ?? cls.courseId;
  const oldStudents = cls.studentIds ?? [];
  const newStudents = updates.studentIds ?? oldStudents;
  const oldAssessors = cls.assessorIds ?? [];
  const newAssessors = updates.assessorIds ?? oldAssessors;

  updates.updatedAt = new Date();
  // Written before reconciling so the "in another class?" guard reads the new
  // membership, not the version this edit is replacing.
  await collection(CLASSES_COLLECTION).updateOne({ _id: cls._id }, { $set: updates });

  if (asId(oldCourseId) !== asId(newCourseId)) {
    // The whole class leaves the old course and joins the new one.
    await unlinkFromCourse(STUDENTS_COLLECTION, "enrolledCourses", oldStudents, oldCourseId, "studentIds", cls._id);
    await unlinkFromCourse(ASSESSORS_COLLECTION, "assigned_courses", oldAssessors, oldCourseId, "assessorIds", cls._id);
    await linkToCourse(STUDENTS_COLLECTION, "enrolledCourses", newStudents, newCourseId);
    await linkToCourse(ASSESSORS_COLLECTION, "assigned_courses", newAssessors, newCourseId);
    await syncAssessorsForCourse(oldCourseId);
    await syncAssessorsForCourse(newCourseId);
  } else {
    const students = diffIds(oldStudents, newStudents);
    const assessors = diffIds(oldAssessors, newAssessors);
    await unlinkFromCourse(STUDENTS_COLLECTION, "enrolledCourses", students.removed, newCourseId, "studentIds", cls._id);
    await unlinkFromCourse(ASSESSORS_COLLECTION, "assigned_courses", assessors.removed, newCourseId, "assessorIds", cls._id);
    await linkToCourse(STUDENTS_COLLECTION, "enrolledCourses", students.added, newCourseId);
    await linkToCourse(ASSESSORS_COLLECTION, "assigned_courses", assessors.added, newCourseId);
    await syncAssessorsForCourse(newCourseId);
  }

  return respondWithClass(cls._id, response);
}

export async function deleteClass(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const cls = await collection(CLASSES_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!cls) return response.status(404).json({ message: "Class not found." });

  // Remove the class first, so the "in another class?" guard cannot count it.
  await collection(CLASSES_COLLECTION).deleteOne({ _id: cls._id });

  await unlinkFromCourse(STUDENTS_COLLECTION, "enrolledCourses", cls.studentIds ?? [], cls.courseId, "studentIds", cls._id);
  await unlinkFromCourse(ASSESSORS_COLLECTION, "assigned_courses", cls.assessorIds ?? [], cls.courseId, "assessorIds", cls._id);
  await syncAssessorsForCourse(cls.courseId);

  return response.json({
    removed: {
      id: asId(cls._id),
      name: cls.name ?? "",
      students: (cls.studentIds ?? []).length,
      assessors: (cls.assessorIds ?? []).length
    }
  });
}
