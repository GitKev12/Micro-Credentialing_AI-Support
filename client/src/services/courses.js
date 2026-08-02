import api from "./api";

/**
 * Course data helpers.
 *
 * GET /api/students/:id/courses resolves the student's enrolledCourses list
 * (on the Student document) to Course documents and returns { courses: [...] }.
 *
 * Each course arrives as { id, code, title, description, imageUrl, hasImage }.
 * `hasImage` means a picture is stored in the database (CourseImage bucket) —
 * load it from courseImageUrl(). `imageUrl` supports external pictures; when
 * neither exists the card falls back to a gradient placeholder.
 */
export async function fetchStudentCourses(studentId) {
  if (!studentId) return [];

  const { data } = await api.get(`/students/${studentId}/courses`);
  return Array.isArray(data) ? data : data?.courses ?? [];
}

export function courseImageUrl(courseId) {
  return `${api.defaults.baseURL}/courses/${courseId}/image`;
}
