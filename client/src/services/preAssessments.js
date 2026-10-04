import api from "./api";

/**
 * Pre-Assessments, from the student's side: 1–5 questions answered once
 * before a lesson opens. Not graded, no badge.
 *
 *   GET  /api/students/:studentId/courses/:courseId/pre-assessments
 *   POST /api/students/:studentId/pre-assessments/:preAssessmentId/submit
 */

/** The course's pre-assessments, each with `moduleId`, `items` and this student's `attempt` (or null). */
export async function fetchCoursePreAssessments(studentId, courseId) {
  if (!studentId || !courseId) return [];
  const { data } = await api.get(`/students/${studentId}/courses/${courseId}/pre-assessments`);
  return Array.isArray(data?.preAssessments) ? data.preAssessments : [];
}

/** `answers` is { [itemId]: choiceId }. Resolves to the attempt, with the answers shown. */
export async function submitPreAssessment(studentId, preAssessmentId, answers) {
  const { data } = await api.post(
    `/students/${studentId}/pre-assessments/${preAssessmentId}/submit`,
    { answers }
  );
  return data.attempt;
}
