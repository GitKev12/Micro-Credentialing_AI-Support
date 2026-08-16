import api from "./api";

/**
 * Admin console API.
 *
 * Backed by /api/admin (server/src/admin). Every list reads live data from
 * MainSystemDB.
 *
 * Nothing here carries a degree batch — no program, no year, no account
 * status. This is a micro-credentialing system, so what it reports is work
 * done and credentials earned.
 */

export async function fetchAdminProfile() {
  const { data } = await api.get("/admin/profile");
  return data.admin;
}

/* ---- Courses ---- */

export async function fetchCourses() {
  const { data } = await api.get("/admin/courses");
  return data.courses ?? [];
}

export async function fetchCourse(courseId) {
  const { data } = await api.get(`/admin/courses/${courseId}`);
  return data.course;
}

export async function createCourse(course) {
  const { data } = await api.post("/admin/courses", course);
  return data.course;
}

/** Send only the fields being changed. */
export async function updateCourse(courseId, changes) {
  const { data } = await api.patch(`/admin/courses/${courseId}`, changes);
  return data.course;
}

/**
 * What withdrawing a course would take with it — lessons, submissions,
 * completions, the blueprint, and how many people it would be withdrawn from.
 */
export async function fetchCourseImpact(courseId) {
  const { data } = await api.get(`/admin/courses/${courseId}/impact`);
  return data.impact ?? {};
}

export async function deleteCourse(courseId) {
  const { data } = await api.delete(`/admin/courses/${courseId}`);
  return data.removed ?? {};
}

/* ---- Learning modules ---- */

// Mirrors MAX_MODULE_BYTES on the server, so an oversized file is refused here
// rather than after uploading every byte of it.
export const MAX_MODULE_BYTES = 40 * 1024 * 1024;

/**
 * Adds a learning module (a lesson PDF) to a course.
 *
 * The file is the request body rather than a multipart form: the API reads it
 * with express.raw(), which needs no parser, and the two text fields ride on
 * the query string. `onProgress` receives 0–100 while the file uploads.
 */
export async function createCourseModule(courseId, file, { title, onProgress } = {}) {
  const { data } = await api.post(`/admin/courses/${courseId}/modules`, file, {
    headers: { "Content-Type": file.type || "application/pdf" },
    params: { title: title ?? "", fileName: file.name },
    onUploadProgress: (event) => {
      if (!onProgress) return;
      const total = event.total ?? file.size;
      if (total) onProgress(Math.round((event.loaded / total) * 100));
    }
  });
  return data.module;
}

/**
 * What deleting a module would take with it — `{ assessments, completions,
 * figures }` — read before the confirmation rather than reported after it.
 * A completion is a student's record that they did the work.
 */
export async function fetchModuleImpact(moduleId) {
  const { data } = await api.get(`/admin/modules/${moduleId}/impact`);
  return data.impact ?? {};
}

/**
 * Removes a module, its file, and everything derived from it. Resolves to
 * `{ title, assessments, completions, figures }` — what actually went with it.
 */
export async function deleteCourseModule(moduleId) {
  const { data } = await api.delete(`/admin/modules/${moduleId}`);
  return data.removed ?? {};
}

/* ---- Students ---- */

/**
 * The student list. Each row carries an `activity`:
 * { lessonsDone, lessonsTotal, badgesEarned, badgesTotal, pending,
 *   lastActive: { at, kind } } — what the student has actually done, as
 * opposed to what they were enrolled in.
 */
export async function fetchStudents() {
  const { data } = await api.get("/admin/students");
  return data.students ?? [];
}

/**
 * One student's record. Beyond the list fields it carries what the detail
 * screen is open to answer:
 *   progress   — completed lessons per enrolled course
 *   badges     — { earned, total, latest, courses: [{ code, title, earned, total }] }
 *   lastActive — { at, kind: "lesson" | "quiz" }, null when they never started
 *   assessors  — who is assigned to the courses they are enrolled in
 */
export async function fetchStudent(studentId) {
  const { data } = await api.get(`/admin/students/${studentId}`);
  return data.student;
}

// The shortest password the API will store. Mirrors MIN_PASSWORD_LENGTH on the
// server, so a too-short one is refused here rather than after a round trip.
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Patches names, email, student number or password. Send only the fields being
 * changed; an omitted or empty password is left alone.
 *
 * There is no create or delete for accounts. Provisioning them is outside this
 * system, so the console corrects records rather than adding to or removing
 * from the roster.
 */
export async function updateStudent(studentId, changes) {
  const { data } = await api.patch(`/admin/students/${studentId}`, changes);
  return data.student;
}

/**
 * Token spend, read from the server's own log — this makes no call to OpenAI
 * and costs nothing, so it is safe to poll.
 */
export async function fetchApiUsage(days = 30) {
  const { data } = await api.get(`/admin/api-usage`, { params: { days } });
  return data;
}

export async function enrollStudent(studentId, courseId) {
  const { data } = await api.post(`/admin/students/${studentId}/courses`, { courseId });
  return data.student;
}

export async function unenrollStudent(studentId, courseId) {
  const { data } = await api.delete(`/admin/students/${studentId}/courses/${courseId}`);
  return data.student;
}

/* ---- Assessors ---- */

/**
 * The assessor list, plus the coverage check the list screen warns with.
 *
 * Resolves to { assessors, coverage } — `coverage.unassigned` are courses no
 * assessor is assigned to, `coverage.shared` are courses more than one is.
 * Each assessor carries a `workload`: { toGrade, flagged, released,
 * credentials, oldestWaiting, lastGraded }.
 */
export async function fetchAssessors() {
  const { data } = await api.get("/admin/assessors");
  return {
    assessors: data.assessors ?? [],
    coverage: data.coverage ?? { unassigned: [], shared: [] }
  };
}

/**
 * One assessor's record. Beyond the list fields it carries `classes` — the
 * assigned courses each with its own students, backlog, releases and
 * credentials.
 */
export async function fetchAssessor(assessorId) {
  const { data } = await api.get(`/admin/assessors/${assessorId}`);
  return data.assessor;
}

/** Patches name, email, ID number or password. Send only what is changing. */
export async function updateAssessor(assessorId, changes) {
  const { data } = await api.patch(`/admin/assessors/${assessorId}`, changes);
  return data.assessor;
}

export async function assignCourse(assessorId, courseId) {
  const { data } = await api.post(`/admin/assessors/${assessorId}/courses`, { courseId });
  return data.assessor;
}

export async function unassignCourse(assessorId, courseId) {
  const { data } = await api.delete(`/admin/assessors/${assessorId}/courses/${courseId}`);
  return data.assessor;
}

/* ---- Table of Specification ---- */

// One blueprint per course, so both calls deal in the whole set. The save
// names the course it applies to; without that the server has nothing to key
// the write on.
export async function fetchTableOfSpecification() {
  const { data } = await api.get("/admin/table-of-specification");
  return Array.isArray(data.blueprints) ? data.blueprints : [];
}

export async function saveTableOfSpecification(blueprint) {
  const { data } = await api.put("/admin/table-of-specification", blueprint);
  return Array.isArray(data.blueprints) ? data.blueprints : [];
}
