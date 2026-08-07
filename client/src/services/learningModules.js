import api, { withAuthToken } from "./api";

/**
 * Learning module (lesson) and assessment helpers for a course.
 *
 *   GET /api/courses/:courseId/modules      → { modules: [...] }
 *   GET /api/courses/:courseId/assessments  → { assessments: [...] }
 *   GET /api/modules/:moduleId/file         → streams the lesson file (PDF)
 *   GET /api/modules/:moduleId/text         → OCR/extracted text, cached server-side
 *
 * Each module arrives as
 *   { id, title, subject, fileName, fileType, fileSize, uploadDate }
 * and each assessment as { id, title, description, status, dueDate }.
 */
export async function fetchCourseModules(courseId) {
  if (!courseId) return [];

  const { data } = await api.get(`/courses/${courseId}/modules`);
  return Array.isArray(data) ? data : data?.modules ?? [];
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

// Extracted text arrives as { title, numPages, hasText, readingMinutes,
// blocks: [{ type, ... }], pages: [{ page, text }] } — `blocks` is the
// lesson-formatted structure, `pages` the raw fallback.
export async function fetchModuleText(moduleId) {
  const { data } = await api.get(`/modules/${moduleId}/text`);
  return data;
}

// Section list for a module's curriculum dropdown — the server derives these
// from the chapter's template headings and caches them with the text.
// Each section is { id, title, page, start, end } (block index range).
export async function fetchModuleSections(moduleId) {
  const { data } = await api.get(`/modules/${moduleId}/sections`);
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
