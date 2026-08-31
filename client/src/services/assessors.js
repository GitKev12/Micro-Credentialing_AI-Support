import api from "./api";
import { getStoredSession } from "../auth/services/authService";

/**
 * Assessor console API. Every route is scoped to the signed-in assessor:
 *
 *   GET  /api/assessors/:id/overview                              → { assessor, summary }
 *   GET  /api/assessors/:id/classes                               → { classes: [...] }
 *   GET  /api/assessors/:id/classes/:courseId/roster              → { course, totalModules, roster }
 *   GET  /api/assessors/:id/classes/:courseId/students/:studentId → per-student detail
 *   GET  /api/assessors/:id/submissions/:sid                      → full review payload
 *   PUT  /api/assessors/:id/submissions/:sid/review               → save draft / release grade
 *   GET  /api/assessors/:id/credentials                           → { pendingCredentials }
 *   POST /api/assessors/:id/credentials/:sid/issue                → { credential }
 *
 * Generating and releasing a course's papers — the Generate Assessment screen:
 *   GET  /api/assessors/:id/classes/:courseId/assessments         → { course, lessons, final }
 *   GET  /api/assessors/:id/classes/:courseId/assessments/:aid    → one paper, keys included
 *   POST /api/assessors/:id/classes/:courseId/assessments/generate
 *   PUT  /api/assessors/:id/classes/:courseId/assessments/:aid    → correct questions
 *   POST /api/assessors/:id/classes/:courseId/assessments/:aid/post
 *   POST /api/assessors/:id/classes/:courseId/assessments/:aid/unpost
 *
 * :id accepts the Mongo id or the ASS### number, so whichever the auth
 * session carries works.
 */
export function storedAssessorId() {
  const user = getStoredSession()?.user;
  return user?.id ?? user?.identifier ?? null;
}

export async function fetchAssessorOverview(assessorId) {
  const { data } = await api.get(`/assessors/${assessorId}/overview`);
  return data;
}

export async function fetchAssessorClasses(assessorId) {
  const { data } = await api.get(`/assessors/${assessorId}/classes`);
  return data?.classes ?? [];
}

export async function fetchClassRoster(assessorId, courseId) {
  const { data } = await api.get(`/assessors/${assessorId}/classes/${courseId}/roster`);
  return data;
}

export async function fetchStudentDetail(assessorId, courseId, studentId) {
  const { data } = await api.get(
    `/assessors/${assessorId}/classes/${courseId}/students/${studentId}`
  );
  return data;
}

/* ─────────────── Generating and releasing assessments ─────────────── */

const assessmentsPath = (assessorId, courseId) =>
  `/assessors/${assessorId}/classes/${courseId}/assessments`;

/** Every lesson's paper and the course's final, with what state each is in. */
export async function fetchCourseAssessments(assessorId, courseId) {
  const { data } = await api.get(assessmentsPath(assessorId, courseId));
  return data;
}

/** One paper in full — questions, choices and the correct answer to each. */
export async function fetchCourseAssessment(assessorId, courseId, assessmentId) {
  const { data } = await api.get(`${assessmentsPath(assessorId, courseId)}/${assessmentId}`);
  return data?.assessment ?? null;
}

/**
 * Writes a draft from the lesson's extracted text.
 *
 * The one call in the console that spends money, and the slowest — the model
 * reads a whole lesson before it writes anything — so the caller shows progress
 * rather than waiting silently. A refusal comes back as `{ error }` with the
 * server's own sentence, because "no extracted text" and "already sat" need
 * different actions from the assessor and both are ordinary outcomes.
 *
 * body: { scope: "lesson" | "final", moduleId?, itemCount?, timeLimitMinutes? }
 */
export async function generateCourseAssessment(assessorId, courseId, body) {
  try {
    const { data } = await api.post(`${assessmentsPath(assessorId, courseId)}/generate`, body);
    return { assessment: data?.assessment ?? null, replaced: Boolean(data?.replaced) };
  } catch (error) {
    return { error: errorMessage(error, "This assessment could not be generated.") };
  }
}

/**
 * Saves corrections to specific questions.
 *
 * `items` is a patch: send only the questions that changed, each as
 * { id, q?, choices?, key?, type? }. `timeLimitMinutes` and `itemsPerAttempt`
 * may travel with them.
 */
export async function updateCourseAssessment(assessorId, courseId, assessmentId, body) {
  try {
    const { data } = await api.put(
      `${assessmentsPath(assessorId, courseId)}/${assessmentId}`,
      body
    );
    return { assessment: data?.assessment ?? null };
  } catch (error) {
    return { error: errorMessage(error, "Your changes could not be saved.") };
  }
}

/** Releases the paper to every student in the course. */
export async function postCourseAssessment(assessorId, courseId, assessmentId) {
  try {
    const { data } = await api.post(
      `${assessmentsPath(assessorId, courseId)}/${assessmentId}/post`
    );
    return { assessment: data?.assessment ?? null };
  } catch (error) {
    return { error: errorMessage(error, "This assessment could not be posted.") };
  }
}

/** Takes it back off, while nobody has sat it. */
export async function unpostCourseAssessment(assessorId, courseId, assessmentId) {
  try {
    const { data } = await api.post(
      `${assessmentsPath(assessorId, courseId)}/${assessmentId}/unpost`
    );
    return { assessment: data?.assessment ?? null };
  } catch (error) {
    return { error: errorMessage(error, "This assessment could not be unposted.") };
  }
}

/**
 * The server's own explanation, or a fallback.
 *
 * Every refusal on the generate screen is something the assessor can act on —
 * extract the lesson's text, shorten the paper, stop trying to rewrite a sat
 * one — so the server's sentence is worth far more than a status code.
 */
function errorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

export async function fetchSubmissionReview(assessorId, submissionId) {
  const { data } = await api.get(`/assessors/${assessorId}/submissions/${submissionId}`);
  return data;
}

// body: { action: "draft" | "release", overrides, finalScore }
export async function saveSubmissionReview(assessorId, submissionId, body) {
  const { data } = await api.put(
    `/assessors/${assessorId}/submissions/${submissionId}/review`,
    body
  );
  return data;
}

export async function fetchPendingCredentials(assessorId) {
  const { data } = await api.get(`/assessors/${assessorId}/credentials`);
  return data?.pendingCredentials ?? [];
}

export async function issueCredential(assessorId, submissionId) {
  const { data } = await api.post(
    `/assessors/${assessorId}/credentials/${submissionId}/issue`
  );
  return data;
}

