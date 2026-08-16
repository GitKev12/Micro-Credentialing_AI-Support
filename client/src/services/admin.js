import api from "./api";

/**
 * Admin console API.
 *
 * Backed by /api/admin (server/src/admin). Every list reads live data from
 * MainSystemDB; a few display fields (student program/year, assessor
 * department) are not stored yet and arrive as null.
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
 * Removes a module, its file, and everything derived from it. Resolves to
 * `{ title, assessments, completions, figures }` — what actually went with it.
 */
export async function deleteCourseModule(moduleId) {
  const { data } = await api.delete(`/admin/modules/${moduleId}`);
  return data.removed ?? {};
}

/* ---- Students ---- */

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

// The states an account can be in. Mirrors STATUSES on the server, which
// rejects anything outside the list.
export const STATUSES = ["Active", "Inactive", "On Leave"];

/** Patches program / year / status. Send only the fields being changed. */
export async function updateStudent(studentId, changes) {
  const { data } = await api.patch(`/admin/students/${studentId}`, changes);
  return data.student;
}

/** Patches status. */
export async function updateAssessor(assessorId, changes) {
  const { data } = await api.patch(`/admin/assessors/${assessorId}`, changes);
  return data.assessor;
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

export async function fetchAssessors() {
  const { data } = await api.get("/admin/assessors");
  return data.assessors ?? [];
}

export async function fetchAssessor(assessorId) {
  const { data } = await api.get(`/admin/assessors/${assessorId}`);
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
