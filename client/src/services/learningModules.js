import api, { withAuthToken } from "./api";

/**
 * Learning module (lesson) and assessment helpers for a course.
 *
 *   GET /api/courses/:courseId/modules      → { course, modules: [...] }
 *   GET /api/courses/:courseId/assessments  → { assessments: [...] }
 *   GET /api/modules/:moduleId/file         → streams the lesson file (PDF)
 *   GET /api/modules/:moduleId/text         → the prepared lesson text, or its status
 *
 * Each module arrives as
 *   { id, title, subject, fileName, fileType, fileSize, uploadDate }
 * and each assessment as { id, title, description, status, dueDate }.
 */
/**
 * A course and its lessons, as `{ course, modules }`.
 *
 * The course itself rides along because the reader is a page a student can
 * land on directly — after a refresh there is no card behind it to have
 * carried one — and `course.ended` is what turns that page read-only.
 */
export async function fetchCourseModules(courseId) {
  if (!courseId) return { course: null, modules: [] };

  const { data } = await api.get(`/courses/${courseId}/modules`);
  if (Array.isArray(data)) return { course: null, modules: data };

  return { course: data?.course ?? null, modules: data?.modules ?? [] };
}

export async function fetchCourseAssessments(courseId) {
  if (!courseId) return [];

  const { data } = await api.get(`/courses/${courseId}/assessments`);
  return Array.isArray(data) ? data : data?.assessments ?? [];
}

export function moduleFileUrl(moduleId) {
  return withAuthToken(`${api.defaults.baseURL}/modules/${moduleId}/file`);
}

// A cropped figure extracted from the module's PDF (see modules.controller).
export function moduleFigureUrl(moduleId, figureId) {
  return withAuthToken(`${api.defaults.baseURL}/modules/${moduleId}/figures/${figureId}`);
}

// A lesson's text is prepared on the server after upload. The answer has a
// `status`:
//   "ready"                 — { title, numPages, hasText, readingMinutes,
//                               blocks: [{ type, ... }], pages: [{ page, text }] }
//                             `blocks` is the lesson-formatted structure,
//                             `pages` the raw fallback
//   "queued" / "extracting" — still being prepared; ask again shortly
//   "failed"                — it couldn't be prepared
export async function fetchModuleText(moduleId) {
  const { data } = await api.get(`/modules/${moduleId}/text`);
  return data;
}

// Section list for a module's curriculum dropdown — the server derives these
// from the chapter's template headings and caches them with the text.
// Each section is { id, title, page, start, end } (block index range).
// Null while the lesson is still being prepared, so the caller asks again
// later instead of keeping an empty list.
export async function fetchModuleSections(moduleId) {
  const { data } = await api.get(`/modules/${moduleId}/sections`);
  if (data?.status && data.status !== "ready") return null;
  return data?.sections ?? [];
}

// Ids of the lessons this student has marked complete in a course.
export async function fetchCourseProgress(studentId, courseId) {
  if (!studentId || !courseId) return [];

  const { data } = await api.get(`/students/${studentId}/courses/${courseId}/progress`);
  return data?.completedModuleIds ?? [];
}

export async function setModuleCompleted(studentId, moduleId, completed) {
  const url = `/students/${studentId}/modules/${moduleId}/complete`;
  const { data } = completed ? await api.post(url) : await api.delete(url);
  return data;
}
