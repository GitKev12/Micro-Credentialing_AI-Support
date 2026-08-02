import api from "./api";

/**
 * Skill gap analysis data for the Student Dashboard.
 *
 * The server exposes a waiting endpoint at:
 *
 *   GET /api/students/:id/skill-gap
 *
 * It reads the CoursePerformance collection and returns { courses: [...] } —
 * an empty list (with pending: true) until the collection has data, so it is
 * always safe to call.
 *
 * Each course is expected as:
 *   { id, title, icon, imageUrl, status, performance, skills: [{ topic, score }] }
 */
export async function fetchStudentSkillGap(studentId) {
  if (!studentId) return [];

  const { data } = await api.get(`/students/${studentId}/skill-gap`);
  return Array.isArray(data) ? data : data?.courses ?? [];
}
