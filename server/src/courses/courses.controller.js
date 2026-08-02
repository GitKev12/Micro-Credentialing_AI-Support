import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";

/**
 * "Abang" — lookout endpoints that wait for their collections.
 *
 * The collections aren't set up yet, so instead of erroring these respond
 * gracefully with an empty list (and `pending: true`) until the collection
 * exists. Once the collection is created with documents linked to a student,
 * the endpoint immediately starts serving real data — no route changes needed.
 *
 * Enrollment model: the Student document carries the enrollment, e.g.
 *   { _id, student_id, enrolledCourses: [<Course _id>, ...] }
 * and each Course document looks like (flexible — common field names accepted):
 *   { _id, courseCode, courseName, description, imageUrl }
 *
 * Expected course performance document shape (one per student per course),
 * powering the Student Dashboard's skill gap analysis:
 *   {
 *     studentId,
 *     courseId,
 *     title,
 *     icon,        // optional emoji shown on the card
 *     imageUrl,    // optional card backdrop
 *     status,      // "in-progress" | "completed"
 *     performance, // overall score, 0–100
 *     skills: [{ topic, score }]
 *   }
 */
const STUDENTS_COLLECTION = "Student";
const COURSES_COLLECTION = "Course";
const PERFORMANCE_COLLECTION = "CoursePerformance";

function toPublicCourse(course) {
  return {
    id: course._id,
    code: (course.code ?? course.courseCode ?? course.course_code ?? "").trim(),
    title: course.title ?? course.courseName ?? course.name ?? course.course_name ?? "",
    description: course.description ?? "",
    imageUrl: course.imageUrl ?? course.image_url ?? null,
    // Set when a picture is stored in the CourseImage bucket — the client
    // then loads GET /api/courses/:id/image.
    hasImage: Boolean(course.imageFileId)
  };
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeStatus(status) {
  const value = String(status ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return value === "completed" ? "completed" : "in-progress";
}

function toSkillEntry(skill) {
  return {
    topic: skill?.topic ?? skill?.name ?? skill?.skill ?? "",
    score: clampScore(skill?.score ?? skill?.value ?? skill?.percentage)
  };
}

function toPublicPerformance(entry) {
  const skills = Array.isArray(entry.skills) ? entry.skills : [];

  return {
    id: entry.courseId ?? entry.course_id ?? entry._id,
    title: entry.title ?? entry.name ?? entry.course_name ?? "",
    icon: entry.icon ?? null,
    imageUrl: entry.imageUrl ?? entry.image_url ?? null,
    status: normalizeStatus(entry.status),
    performance: clampScore(entry.performance ?? entry.overallScore ?? entry.overall_score),
    skills: skills.map(toSkillEntry).filter((skill) => skill.topic)
  };
}

export async function getStudentCourses(request, response) {
  const studentId = request.params.id;

  // Still waiting on the database / courses collection — respond with nothing
  // yet rather than failing.
  if (!(await collectionExists(COURSES_COLLECTION))) {
    return response.json({ courses: [], pending: true });
  }

  // Enrollment lives on the Student document: find the student (by Mongo _id
  // from the session, or by their student number), then load the Course docs
  // listed in enrolledCourses.
  const student = await mongoose.connection
    .collection(STUDENTS_COLLECTION)
    .findOne({
      $or: [{ _id: { $in: idCandidates(studentId) } }, { student_id: studentId }]
    });

  const enrolled =
    student?.enrolledCourses ?? student?.enrolled_courses ?? student?.courses ?? [];

  if (!Array.isArray(enrolled) || enrolled.length === 0) {
    return response.json({ courses: [] });
  }

  const courses = await mongoose.connection
    .collection(COURSES_COLLECTION)
    .find({ _id: { $in: enrolled.flatMap(idCandidates) } })
    .toArray();

  return response.json({ courses: courses.map(toPublicCourse) });
}

export async function getStudentSkillGap(request, response) {
  const studentId = request.params.id;

  // Same lookout behavior: no CoursePerformance collection yet means the
  // dashboard gets an empty (pending) result instead of an error.
  if (!(await collectionExists(PERFORMANCE_COLLECTION))) {
    return response.json({ courses: [], pending: true });
  }

  const entries = await mongoose.connection
    .collection(PERFORMANCE_COLLECTION)
    .find({ $or: [{ studentId }, { student_id: studentId }] })
    .toArray();

  return response.json({ courses: entries.map(toPublicPerformance) });
}
