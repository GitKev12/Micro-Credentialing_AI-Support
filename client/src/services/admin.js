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

/* ---- Students ---- */

export async function fetchStudents() {
  const { data } = await api.get("/admin/students");
  return data.students ?? [];
}

export async function fetchStudent(studentId) {
  const { data } = await api.get(`/admin/students/${studentId}`);
  return data.student;
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
