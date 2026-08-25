import api from "./api";
import { getStoredSession } from "../auth/services/authService";

/**
 * Assessor console API. Every route is scoped to the signed-in assessor:
 *
 *   GET  /api/assessors/:id/overview                              → { assessor, summary }
 *   GET  /api/assessors/:id/classes                               → { classes: [...] }
 *   GET  /api/assessors/:id/classes/:courseId/roster              → { course, totalModules, roster }
 *   GET  /api/assessors/:id/classes/:courseId/students/:studentId → per-student detail
 *   GET  /api/assessors/:id/queue                                 → { queue, counts }
 *   POST /api/assessors/:id/queue/release-confident               → { released }
 *   GET  /api/assessors/:id/submissions/:sid                      → full review payload
 *   PUT  /api/assessors/:id/submissions/:sid/review               → save draft / release grade
 *   GET  /api/assessors/:id/credentials                           → { pendingCredentials }
 *   POST /api/assessors/:id/credentials/:sid/issue                → { credential }
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

export async function fetchGradingQueue(assessorId) {
  const { data } = await api.get(`/assessors/${assessorId}/queue`);
  return data;
}

export async function releaseConfident(assessorId) {
  const { data } = await api.post(`/assessors/${assessorId}/queue/release-confident`);
  return data;
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

/** "2 hours ago" style label for a submission timestamp. */
export function timeAgo(iso) {
  if (!iso) return "recently";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
