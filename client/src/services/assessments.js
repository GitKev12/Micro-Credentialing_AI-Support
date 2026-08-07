import api from "./api";

/**
 * Quizzes, from the student's side.
 *
 * These endpoints are student-scoped rather than course-scoped because a quiz
 * means nothing without knowing who is asking: whether it is unlocked, and
 * whether they have already sat it, are both per-student facts.
 *
 *   GET  /api/students/:studentId/courses/:courseId/assessments
 *   GET  /api/students/:studentId/assessments/:assessmentId
 *   POST /api/students/:studentId/assessments/:assessmentId/submit
 */

/** Every quiz in a course, each with `locked`, `reason` and `result`. */
export async function fetchCourseAssessments(studentId, courseId) {
  if (!studentId || !courseId) return [];

  const { data } = await api.get(`/students/${studentId}/courses/${courseId}/assessments`);
  return Array.isArray(data?.assessments) ? data.assessments : [];
}

/**
 * The questions, with no answer key — the server strips it. A locked quiz
 * answers 423, which surfaces here as `{ locked: true, message }` rather than
 * a thrown error, since the rail can legitimately be a moment out of date.
 */
export async function fetchAssessment(studentId, assessmentId) {
  try {
    const { data } = await api.get(`/students/${studentId}/assessments/${assessmentId}`);
    return { assessment: data?.assessment ?? null, result: data?.result ?? null };
  } catch (error) {
    if (error.response?.status === 423) {
      return { locked: true, message: error.response.data?.message ?? "This quiz is locked." };
    }
    throw error;
  }
}

/**
 * Submits answers as [{ itemId, choice }]. A second attempt answers 409 with
 * the mark already on record, which the caller shows instead of an error.
 */
export async function submitAssessment(studentId, assessmentId, answers) {
  try {
    const { data } = await api.post(
      `/students/${studentId}/assessments/${assessmentId}/submit`,
      { answers }
    );
    return { result: data?.result ?? null };
  } catch (error) {
    const status = error.response?.status;
    if (status === 409) {
      return {
        alreadySubmitted: true,
        result: error.response.data?.result ?? null,
        message: error.response.data?.message ?? "Already submitted."
      };
    }
    if (status === 423) {
      return { locked: true, message: error.response.data?.message ?? "This quiz is locked." };
    }
    throw error;
  }
}
