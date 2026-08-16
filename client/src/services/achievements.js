import api, { withAuthToken } from "./api";

/**
 * Certifications and badges for the Student Dashboard.
 *
 *   GET /api/students/:id/achievements → { certifications: [...], badges: [...] }
 *
 * The two are deliberately different things. A certification is a
 * micro-credential an assessor released after approving a final grade, so it
 * names a course and carries an issue date:
 *   { id, name, courseCode, courseTitle, assessmentTitle,
 *     status: "issued" | "pending", issuedAt, score, totalPoints,
 *     document: { id, filename, issuedBy, issuedAt } | null }
 *
 * `document` is the printable certificate stamped when the assessor released
 * the credential — null when none was generated, which the card treats as "the
 * record stands, the sheet just isn't there".
 *
 * A badge is the lesson-level recognition, read from the Badge catalog: one
 * badge per lesson, its name being that lesson's title and its icon being the
 * course's own artwork (a data: URI — `iconType` says whether to render it as
 * an image or as a plain glyph). It is earned by passing that lesson's quiz.
 * Unearned ones arrive too, so the wall shows the whole course:
 *   { id, moduleId, name, lessonTitle, description, icon, iconType,
 *     courseId, courseCode, courseTitle, order, earnedBy,
 *     earned, earnedAt, current, target }
 *
 * They arrive grouped by course and ordered by chapter within it.
 *
 * Both lists are empty (never an error) until the underlying collections have
 * data, so this is always safe to call.
 */
export async function fetchStudentAchievements(studentId) {
  if (!studentId) return { certifications: [], badges: [] };

  const { data } = await api.get(`/students/${studentId}/achievements`);
  return {
    certifications: data?.certifications ?? [],
    badges: data?.badges ?? []
  };
}

/** The stamped PDF — opened in a tab rather than fetched, so the browser's own
 *  PDF viewer handles it. */
export function certificateFileUrl(studentId, certificateId) {
  return withAuthToken(
    `${api.defaults.baseURL}/students/${studentId}/certificates/${certificateId}/file`
  );
}
