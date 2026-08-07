import api, { withAuthToken } from "./api";

/**
 * Course data helpers.
 *
 * GET /api/students/:id/courses resolves the student's enrolledCourses list
 * (on the Student document) to Course documents and returns { courses: [...] }.
 *
 * Each course arrives as
 *   { id, code, title, description, imageUrl, hasImage,
 *     moduleCount, completedModules, progress, status }
 *
 * `hasImage` means a picture is stored in the database (CourseImage bucket) —
 * load it from courseImageUrl(). `imageUrl` supports external pictures; when
 * neither exists the card falls back to a gradient placeholder.
 *
 * The progress fields are counted server-side from the lessons the student has
 * marked complete in the reader; `status` is "completed" | "in-progress" |
 * "not-started", derived from them (see courses.controller.js).
 */
export async function fetchStudentCourses(studentId) {
  if (!studentId) return [];

  const { data } = await api.get(`/students/${studentId}/courses`);
  return Array.isArray(data) ? data : data?.courses ?? [];
}

export function courseImageUrl(courseId) {
  return withAuthToken(`${api.defaults.baseURL}/courses/${courseId}/image`);
}
