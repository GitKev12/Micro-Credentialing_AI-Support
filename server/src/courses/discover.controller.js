import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { courseStatus } from "../lib/courseAccess.js";
import { toIsoDay } from "../lib/courseDates.js";
import { classMode, isAssessOnly, CLASS_MODES, MODE_LABELS } from "../lib/classMode.js";
import { sortLessons } from "../lib/lessonOrder.js";
import { paperBelongsToClass, papersForClass } from "../assessments/classPapers.js";
import { credentialNameFor } from "../assessments/assessments.format.js";
import { enrolledCourseIds } from "../middleware/student.guard.js";
import {
  addRequest,
  addStudentToClass,
  enrollmentOf,
  isOpenOnDiscover,
  removeRequest
} from "../admin/classEnrollment.js";
import { personName } from "../admin/classes.controller.js";
import { loadEnrollment } from "./courses.controller.js";

/**
 * Discover in the Student End: the courses a student can join, one course, and
 * the Enroll button behind it.
 *
 * Mounted at /api/students:
 *   GET    /:id/discover                      the course cards
 *   GET    /:id/discover/:courseId            one course, its syllabus, its pathways
 *   POST   /:id/discover/:courseId/enroll     join (open) or ask to join (approval)
 *   DELETE /:id/discover/:courseId/request    take back a pending request
 *
 * Sections are not part of any of this. A section is how the school sorts its
 * students, not something a candidate picks: they choose the *pathway* — taught
 * and assessed, or assess-only — and the server puts them in a section running
 * it. Which section they landed in is the admin's business, and the admin can
 * move them afterwards without the student ever seeing a section name.
 *
 * The class is still what everything downstream is keyed on, so a request is
 * still stored against one class and the admin still accepts it in the Edit
 * class Requests panel. Only the Student End stopped naming it.
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
    category: String(course.category ?? "").trim(),
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

/**
 * The section a candidate choosing this pathway gets, or null when the pathway
 * is not running.
 *
 * Open before approval: a student who could have walked in should not be made
 * to ask because the alphabetically-first section happens to be the gated one.
 * Then the emptiest, so sections fill evenly rather than the same one filling
 * first. This is also what decides the button's wording, because the pathway
 * reports the enrollment of the very class it would put them in — the label can
 * never promise something different from what the press does.
 */
function pickClass(open, mode) {
  return open
    .filter((cls) => classMode(cls) === mode)
    .sort((a, b) => {
      const gated = (cls) => (enrollmentOf(cls) === "open" ? 0 : 1);
      return gated(a) - gated(b) || (a.studentIds ?? []).length - (b.studentIds ?? []).length;
    })[0] ?? null;
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
    const open = onCourse.filter((cls) => isOpenOnDiscover(cls, course, now));
    const isEnrolled = enrolled.has(asId(course._id));
    const pending = onCourse.some((cls) => stateIn(cls, me) === "pending");

    // Only courses a student can join, plus the ones they are already in.
    if (open.length === 0 && !isEnrolled && !pending) continue;
    cards.push({
      ...courseCard(course),
      // Each pathway the course runs and how it is joined, e.g.
      // [{ enrollment: "open", mode: "taught" }]. Only the section the server
      // would put the student in counts, so the "How to join" filter always
      // agrees with the Enroll / Request to enroll button on the course page.
      openSections: CLASS_MODES.map((mode) => pickClass(open, mode))
        .filter(Boolean)
        .map((cls) => ({ enrollment: enrollmentOf(cls), mode: classMode(cls) })),
      enrolled: isEnrolled,
      pending
    });
  }

  cards.sort((a, b) => a.title.localeCompare(b.title));
  return response.json({ courses: cards });
}

/**
 * One course as the course page shows it: what it is, what is in it, and the
 * pathways it can be taken through.
 */
async function buildDetail(student, courseId) {
  const course = await collection("Course").findOne({ _id: { $in: idCandidates(courseId) } });
  if (!course || courseStatus(course) !== "active") return null;

  const me = asId(student._id);
  const now = new Date();
  const classes = await classesOnCourses({ courseId: { $in: idCandidates(course._id) } });
  const open = classes.filter((cls) => isOpenOnDiscover(cls, course, now));

  // The class this student already holds a place or a request in. It is never
  // named on screen; it is what the pathway chip and the cancel button act on.
  const mine = classes.find((cls) => stateIn(cls, me) !== "none") ?? null;

  const code = courseCode(course);
  const byCourse = { $or: [{ courseId: { $in: idCandidates(course._id) } }, ...(code ? [{ courseCode: code }] : [])] };

  const [lessons, badges, finals] = await Promise.all([
    collection("LearningModule").find(byCourse).toArray(),
    collection("Badge").find({ ...byCourse, active: { $ne: false } }).toArray(),
    collection("Assessment")
      .find({ courseId: { $in: idCandidates(course._id) }, scope: "final", status: "posted" })
      .toArray()
  ]);

  // The syllabus, in chapter order. Titles only — this is the course's contents
  // page, not the lessons, so it gives an assess-only candidate nothing to read
  // that the printed outline would not.
  const badgeFor = new Map(badges.filter((b) => b.moduleId).map((b) => [asId(b.moduleId), b]));
  const curriculum = sortLessons(lessons).map((lesson) => ({
    id: asId(lesson._id),
    title: lesson.title || lesson.fileName || "",
    badge: badgeFor.get(asId(lesson._id))?.name ?? null
  }));

  const picked = CLASS_MODES.map((mode) => [mode, pickClass(open, mode)]).filter(([, cls]) => cls);

  // The assessor's name for each class shown: the one each pathway would put
  // the student in, and the one they are already in or waiting on.
  const shown = [...picked.map(([, cls]) => cls), ...(mine ? [mine] : [])];
  const assessors = await collection("Assessor")
    .find({ _id: { $in: shown.flatMap((cls) => (cls.assessorIds ?? []).slice(0, 1).flatMap(idCandidates)) } })
    .toArray();
  const assessorOf = (cls) => {
    const assessor = assessors.find((row) => asId(row._id) === asId(cls?.assessorIds?.[0]));
    return assessor ? personName(assessor) : null;
  };

  // The credential a class's final awards (the name on its certificate), or
  // null while that class has no posted final.
  const certificateOf = (cls) => {
    const [final] = papersForClass(finals, cls._id, { assessOnly: isAssessOnly(cls) });
    return final ? credentialNameFor(final) : null;
  };

  const pathways = picked.map(([mode, cls]) => ({
    mode,
    label: MODE_LABELS[mode],
    enrollment: enrollmentOf(cls),
    assessor: assessorOf(cls),
    certificate: certificateOf(cls)
  }));

  const state = mine ? stateIn(mine, me) : "none";
  return {
    course: {
      ...courseCard(course),
      description: course.description ?? "",
      // "30 Hours", the way a catalogue entry says how long it takes.
      courseHours: course.courseHours ?? null,
      lessonCount: lessons.length,
      badgeCount: badges.length,
      hasFinalExam: finals.length > 0,
      // Everyone on the course, the way a catalogue says how many are taking it.
      learnerCount: classes.reduce((total, cls) => total + (cls.studentIds ?? []).length, 0),
      enrolled: enrolledCourseIds(student).map(asId).includes(asId(course._id)),
      pending: state === "pending",
      // Which pathway they are on, so the page can say so without a section.
      myMode: mine ? classMode(mine) : null,
      // Sent on its own, because their class may no longer be open on Discover.
      myModeLabel: mine ? MODE_LABELS[classMode(mine)] : null,
      myAssessor: mine ? assessorOf(mine) : null,
      myCertificate: mine ? certificateOf(mine) : null,
      myFinalExam: mine
        ? finals.some((doc) => paperBelongsToClass(doc, mine._id, { assessOnly: isAssessOnly(mine) }))
        : false
    },
    pathways,
    curriculum
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

/** POST /api/students/:id/discover/:courseId/enroll  body: { mode } */
export async function enrollInCourse(request, response) {
  if (mongoose.connection.readyState !== 1) return notReady(response);

  const { student } = await loadEnrollment(request.params.id);
  if (!student) return response.status(404).json({ message: "Student not found." });

  const mode = request.body?.mode;
  if (!CLASS_MODES.includes(mode)) {
    return response.status(400).json({ message: "Choose how you want to take this course." });
  }

  const course = await collection("Course").findOne({ _id: { $in: idCandidates(request.params.courseId) } });
  const closed = { message: "This course isn't open for enrollment." };
  if (!course || courseStatus(course) !== "active") return response.status(404).json(closed);

  if (enrolledCourseIds(student).map(asId).includes(asId(course._id))) {
    return response.status(409).json({ message: "You're already enrolled in this course." });
  }
  const classes = await classesOnCourses({ courseId: { $in: idCandidates(course._id) } });
  if (classes.some((cls) => stateIn(cls, asId(student._id)) === "pending")) {
    return response.status(409).json({ message: "You already asked to join this course." });
  }

  const cls = pickClass(classes.filter((c) => isOpenOnDiscover(c, course)), mode);
  if (!cls) return response.status(404).json({ message: `${MODE_LABELS[mode]} isn't open on this course.` });

  // Through the shared writes: they hold the one-class-per-course rule, the
  // roll-back when two joins race, and the write-through to the student's
  // course list, the assessor sync and the standing event.
  const refusal =
    enrollmentOf(cls) === "open" ? await addStudentToClass(cls, student) : await addRequest(cls, student);
  if (refusal) return response.status(409).json({ message: refusal });

  // Re-read: the join just changed the student's course list.
  const { student: updated } = await loadEnrollment(request.params.id);
  return respondWithDetail(response, updated ?? student, course._id);
}

/** DELETE /api/students/:id/discover/:courseId/request */
export async function cancelEnrollRequest(request, response) {
  if (mongoose.connection.readyState !== 1) return notReady(response);

  const { student } = await loadEnrollment(request.params.id);
  if (!student) return response.status(404).json({ message: "Student not found." });

  const me = asId(student._id);
  const classes = await classesOnCourses({ courseId: { $in: idCandidates(request.params.courseId) } });
  // Found by course, because the student never saw which class is holding it.
  const held = classes.find((cls) => stateIn(cls, me) === "pending");
  if (held) await removeRequest(held, student._id);

  return respondWithDetail(response, student, request.params.courseId);
}
