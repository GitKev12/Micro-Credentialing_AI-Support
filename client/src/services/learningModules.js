import api from "./api";

/**
 * Learning module (lesson) and assessment helpers for a course.
 *
 *   GET /api/courses/:courseId/modules      → { modules: [...] }
 *   GET /api/courses/:courseId/assessments  → { assessments: [...] }
 *   GET /api/modules/:moduleId/file         → streams the lesson file (PDF)
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
  return `${api.defaults.baseURL}/modules/${moduleId}/file`;
}
