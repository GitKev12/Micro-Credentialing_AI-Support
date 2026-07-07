import api from "./api";

/**
 * Course data helpers.
 *
 * GET /api/students/:id/courses resolves the student's enrolledCourses list
 * (on the Student document) to Course documents and returns { courses: [...] }.
 *
 * Each course arrives as { id, code, title, imageUrl }. `imageUrl` is the
 * course picture shown behind the card name; when absent the card falls back to
 * a gradient placeholder.
 */
export async function fetchStudentCourses(studentId) {
  if (!studentId) return [];

  const { data } = await api.get(`/students/${studentId}/courses`);
  return Array.isArray(data) ? data : data?.courses ?? [];
}
