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
 *
 * Nothing here writes a quiz. Papers are generated and released by the
 * assessor — see the console's Generate Assessment screen — so a student who
 * finishes a lesson now waits for their assessor rather than for a model call.
 */

/**
 * Every quiz in a course, each with `locked`, `reason` and `result`.
 *
 * A lesson whose quiz the assessor has not posted comes back as a locked
 * placeholder whose `reason` says who opens it. Reading this costs nothing and
 * writes nothing.
 */
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
 *
 * `badge` rides along on a passing lesson quiz — { id, name, icon, iconType } —
 * and is null on a fail, on a final, and on a re-submission. It is what the
 * "You Earned …" popup is drawn from, so it arrives only when the badge was
 * earned by *this* submission rather than at some earlier point.
 */
export async function submitAssessment(studentId, assessmentId, answers) {
  try {
    const { data } = await api.post(
      `/students/${studentId}/assessments/${assessmentId}/submit`,
      { answers }
    );
    return { result: data?.result ?? null, badge: data?.badge ?? null };
  } catch (error) {
    const status = error.response?.status;
    // 409 no longer means "already submitted" — a paper may be sat again. It
    // means this student has no attempt left to spend on it, and the server
    // says which rule stopped them.
    if (status === 409) {
      return {
        alreadySubmitted: true,
        result: error.response.data?.result ?? null,
        message: error.response.data?.message ?? "No attempts left for this assessment."
      };
    }
    if (status === 423) {
      return { locked: true, message: error.response.data?.message ?? "This quiz is locked." };
    }
    throw error;
  }
}
