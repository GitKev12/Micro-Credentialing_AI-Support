import api from "./api";

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
 * A badge is a milestone the server derives from work already recorded —
 * lessons read, courses finished. Locked ones arrive too, with the counts
 * that would unlock them:
 *   { id, name, description, icon, earned, earnedAt, current, target }
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
  return `${api.defaults.baseURL}/students/${studentId}/certificates/${certificateId}/file`;
}
