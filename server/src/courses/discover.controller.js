import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { courseStatus } from "../lib/courseAccess.js";
import { toIsoDay } from "../lib/courseDates.js";
import { classMode, isAssessOnly } from "../lib/classMode.js";
import { paperBelongsToClass } from "../assessments/classPapers.js";
import { enrolledCourseIds } from "../middleware/student.guard.js";
import { personName } from "../admin/classes.controller.js";
import {
  addRequest,
  addStudentToClass,
  enrollmentOf,
  isOpenOnDiscover,
  removeRequest
} from "../admin/classEnrollment.js";
import { loadEnrollment } from "./courses.controller.js";

/**
 * Discover in the Student End: the courses a student can join, one course's
 * open sections, and the Enroll button behind them.
 *
 * Mounted at /api/students:
 *   GET    /:id/discover                     the course cards
 *   GET    /:id/discover/:courseId           one course and its sections
 *   POST   /:id/classes/:classId/enroll      join (open) or ask to join (approval)
 *   DELETE /:id/classes/:classId/request     take back a pending request
 */

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);

const courseCode = (course) => String(course?.courseCode ?? course?.code ?? course?.course_code ?? "").trim();
const courseTitle = (course) => course?.courseName ?? course?.title ?? course?.name ?? course?.course_name ?? "";

function notReady(response) {
  return response.status(503).json({ message: "The database is not connected. Try again shortly." });
}

/** The part of a course both the card and the course view show. */
function courseCard(course) {
  return {
    id: asId(course._id),
    code: courseCode(course),
    title: courseTitle(course),
    startsOn: toIsoDay(course.startsOn),
    endsOn: toIsoDay(course.endsOn),
    hasImage: Boolean(course.imageFileId),
    imageUpdatedAt: toIsoDay(course.imageUpdatedAt),
    imageUrl: course.imageUrl ?? course.image_url ?? null
  };
}

/** "enrolled", "pending" or "none" — where this student stands in one class. */
function stateIn(cls, studentId) {
  const holds = (list) => (list ?? []).some((id) => asId(id) === studentId);
  if (holds(cls.studentIds)) return "enrolled";
  if (holds(cls.requestedStudentIds)) return "pending";
  return "none";
}

async function classesOnCourses(filter = {}) {
  if (!(await collectionExists("Class"))) return [];
  return collection("Class").find({ ...filter, archived: { $ne: true } }).toArray();
}

/** GET /api/students/:id/discover */
export async function listDiscoverCourses(request, response) {
  if (mongoose.connection.readyState !== 1) return notReady(response);
  if (!(await collectionExists("Course"))) return response.json({ courses: [] });

  const { student } = await loadEnrollment(request.params.id);
  if (!student) return response.status(404).json({ message: "Student not found." });

  const me = asId(student._id);
  const enrolled = new Set(enrolledCourseIds(student).map(asId));
  const [courses, classes] = await Promise.all([collection("Course").find({}).toArray(), classesOnCourses()]);

  const classesByCourse = new Map();
  for (const cls of classes) {
    const key = asId(cls.courseId);
    if (!classesByCourse.has(key)) classesByCourse.set(key, []);
    classesByCourse.get(key).push(cls);
  }

  const now = new Date();
  const cards = [];
  for (const course of courses) {
    // Inactive and archived courses never show on Discover.
    if (courseStatus(course) !== "active") continue;

    const onCourse = classesByCourse.get(asId(course._id)) ?? [];
    const sectionCount = onCourse.filter((cls) => isOpenOnDiscover(cls, course, now)).length;
    const isEnrolled = enrolled.has(asId(course._id));
    const pending = onCourse.some((cls) => stateIn(cls, me) === "pending");

    // Only courses a student can join, plus the ones they are already in.
    if (sectionCount === 0 && !isEnrolled && !pending) continue;
    cards.push({ ...courseCard(course), sectionCount, enrolled: isEnrolled, pending });
  }

  cards.sort((a, b) => a.title.localeCompare(b.title));
  return response.json({ courses: cards });
}

/**
 * One course with the sections this student can see: every open one, plus the
 * class they are in and any class holding their request (so a request on a
 * class that was switched off can still be taken back).
 */
async function buildDetail(student, courseId) {
  const course = await collection("Course").findOne({ _id: { $in: idCandidates(courseId) } });
  if (!course || courseStatus(course) !== "active") return null;

  const me = asId(student._id);
  const now = new Date();
  const classes = await classesOnCourses({ courseId: { $in: idCandidates(course._id) } });
  const shown = classes.filter((cls) => isOpenOnDiscover(cls, course, now) || stateIn(cls, me) !== "none");

  const code = courseCode(course);
  const byCourse = { $or: [{ courseId: { $in: idCandidates(course._id) } }, ...(code ? [{ courseCode: code }] : [])] };
  const assessorIds = shown.flatMap((cls) => cls.assessorIds ?? []).flatMap((id) => idCandidates(id));

  // Counts only: an assess-only candidate may not see the lessons themselves.
  const [lessonCount, badgeCount, finals, assessors] = await Promise.all([
    collection("LearningModule").countDocuments(byCourse),
    collection("Badge").countDocuments({ ...byCourse, active: { $ne: false } }),
    collection("Assessment")
      .find({ courseId: { $in: idCandidates(course._id) }, scope: "final", status: "posted" })
      .toArray(),
    assessorIds.length ? collection("Assessor").find({ _id: { $in: assessorIds } }).toArray() : []
  ]);
  const assessorById = new Map(assessors.map((assessor) => [asId(assessor._id), assessor]));

  const sections = shown
    .map((cls) => {
      const assessor = assessorById.get(asId((cls.assessorIds ?? [])[0]));
      const schedule = cls.schedule ?? {};
      return {
        id: asId(cls._id),
        name: cls.name || code,
        mode: classMode(cls),
        enrollment: enrollmentOf(cls),
        schedule: {
          days: String(schedule.days ?? "").trim(),
          time: String(schedule.time ?? "").trim(),
          room: String(schedule.room ?? "").trim()
        },
        assessor: assessor ? personName(assessor) : null,
        hasFinalExam: finals.some((doc) => paperBelongsToClass(doc, cls._id, { assessOnly: isAssessOnly(cls) })),
        state: stateIn(cls, me),
        open: isOpenOnDiscover(cls, course, now)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    course: {
      ...courseCard(course),
      description: course.description ?? "",
      lessonCount,
      badgeCount,
      hasFinalExam: finals.length > 0,
      enrolled: enrolledCourseIds(student).map(asId).includes(asId(course._id)),
      pending: sections.some((section) => section.state === "pending")
    },
    sections
  };
}

async function respondWithDetail(response, student, courseId) {
  const detail = await buildDetail(student, courseId);
  if (!detail) return response.status(404).json({ message: "This course isn't open on Discover." });
  return response.json(detail);
}

/** GET /api/students/:id/discover/:courseId */
export async function getDiscoverCourse(request, response) {
  if (mongoose.connection.readyState !== 1) return notReady(response);

  const { student } = await loadEnrollment(request.params.id);
  if (!student) return response.status(404).json({ message: "Student not found." });
  return respondWithDetail(response, student, request.params.courseId);
}

async function findClass(classId) {
  return collection("Class").findOne({ _id: { $in: idCandidates(classId) } });
}

/** POST /api/students/:id/classes/:classId/enroll */
export async function enrollInClass(request, response) {
  if (mongoose.connection.readyState !== 1) return notReady(response);

  const { student } = await loadEnrollment(request.params.id);
  if (!student) return response.status(404).json({ message: "Student not found." });

  const closed = { message: "This class isn't open for enrollment." };
  const cls = await findClass(request.params.classId);
  if (!cls) return response.status(404).json(closed);
  const course = await collection("Course").findOne({ _id: { $in: idCandidates(cls.courseId) } });
  if (!isOpenOnDiscover(cls, course)) return response.status(404).json(closed);

  if (enrolledCourseIds(student).map(asId).includes(asId(course._id))) {
    return response.status(409).json({ message: "You're already enrolled in this course." });
  }
  const waiting = await collection("Class").findOne({
    courseId: { $in: idCandidates(course._id) },
    requestedStudentIds: { $in: idCandidates(student._id) }
  });
  if (waiting) {
    return response.status(409).json({ message: `You already asked to join ${waiting.name || courseCode(course)}.` });
  }

  const refusal =
    enrollmentOf(cls) === "open" ? await addStudentToClass(cls, student) : await addRequest(cls, student);
  if (refusal) return response.status(409).json({ message: refusal });

  // Re-read: the join just changed the student's course list.
  const { student: updated } = await loadEnrollment(request.params.id);
  return respondWithDetail(response, updated ?? student, course._id);
}

/** DELETE /api/students/:id/classes/:classId/request */
export async function cancelEnrollRequest(request, response) {
  if (mongoose.connection.readyState !== 1) return notReady(response);

  const { student } = await loadEnrollment(request.params.id);
  if (!student) return response.status(404).json({ message: "Student not found." });

  const cls = await findClass(request.params.classId);
  if (!cls) return response.status(404).json({ message: "Class not found." });

  await removeRequest(cls, student._id);
  return respondWithDetail(response, student, cls.courseId);
}
