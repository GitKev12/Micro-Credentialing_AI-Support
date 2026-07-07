import mongoose from "mongoose";

/**
 * "Abang" — lookout endpoints that wait for their collections.
 *
 * The collections aren't set up yet, so instead of erroring these respond
 * gracefully with an empty list (and `pending: true`) until the collection
 * exists. Once the collection is created with documents linked to a student,
 * the endpoint immediately starts serving real data — no route changes needed.
 *
 * Expected course document shape (flexible — common field names are accepted):
 *   { studentId, code, title, imageUrl }
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
const COURSES_COLLECTION = "Course";
const PERFORMANCE_COLLECTION = "CoursePerformance";

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

async function collectionExists(name) {
  if (!isDatabaseReady()) return false;
  const collections = await mongoose.connection.db
    .listCollections({ name }, { nameOnly: true })
    .toArray();
  return collections.length > 0;
}

function toPublicCourse(course) {
  return {
    id: course._id,
    code: course.code ?? course.course_code ?? "",
    title: course.title ?? course.name ?? course.course_name ?? "",
    imageUrl: course.imageUrl ?? course.image_url ?? null
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

  const courses = await mongoose.connection
    .collection(COURSES_COLLECTION)
    .find({ $or: [{ studentId }, { student_id: studentId }, { studentIds: studentId }] })
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
