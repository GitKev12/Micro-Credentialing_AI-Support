import api from "./api";

/**
 * Course data helpers.
 *
 * The courses collection / API is being set up. The server already exposes a
 * waiting endpoint (the "abang") at:
 *
 *   GET /api/students/:id/courses
 *
 * which returns { courses: [...] } once the data exists and an empty list until
 * then. Flip COURSES_API_READY to true to start calling it.
 *
 * Each course is expected as { id, code, title, imageUrl }. `imageUrl` is the
 * course picture shown behind the card name; when absent the card falls back to
 * a gradient placeholder.
 */
const COURSES_API_READY = false;

export async function fetchStudentCourses(studentId) {
  if (!COURSES_API_READY || !studentId) return [];

  const { data } = await api.get(`/students/${studentId}/courses`);
  return Array.isArray(data) ? data : data?.courses ?? [];
}
