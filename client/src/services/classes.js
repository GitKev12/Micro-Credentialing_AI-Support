import api from "./api";

/**
 * Classes admin API.
 *
 * A class ties one course to its assessors and students, with a schedule label.
 * Backed by /api/admin/classes (server/src/admin/classes.controller.js), which
 * writes through to enrolledCourses / assigned_courses — so creating a class is
 * how an admin enrolls and assigns in one place, and every other screen keeps
 * reading the same fields it always has.
 */

export async function fetchClasses() {
  const { data } = await api.get("/admin/classes");
  return data.classes ?? [];
}

export async function fetchClass(classId) {
  const { data } = await api.get(`/admin/classes/${classId}`);
  return data.class;
}

/** `payload` is { name, courseId, assessorIds, studentIds, schedule }. */
export async function createClass(payload) {
  const { data } = await api.post("/admin/classes", payload);
  return data.class;
}

/** Send only the fields being changed. */
export async function updateClass(classId, changes) {
  const { data } = await api.patch(`/admin/classes/${classId}`, changes);
  return data.class;
}

/**
 * Run this class, or stop running it.
 *
 * A patch of the one field, so a toggle from the list cannot overwrite a roster
 * someone is editing in the form at the same time.
 */
export async function setClassActive(classId, active) {
  const { data } = await api.patch(`/admin/classes/${classId}`, { active });
  return data.class;
}

// Archive a class (true) or restore it (false). Archiving also switches it off.
export async function setClassArchived(classId, archived) {
  const { data } = await api.patch(`/admin/classes/${classId}`, { archived });
  return data.class;
}

/**
 * What switching a class's pathway would cost — `{ from, to, students, badges,
 * badgeHolders, finalsTaken, quizzes }`. Nothing is deleted by the switch, and
 * nothing it takes can be handed back by switching again, which is why it is
 * read before the confirmation will agree to it.
 */
export async function fetchPathwayImpact(classId, mode) {
  const { data } = await api.get(`/admin/classes/${classId}/pathway-impact`, {
    params: { mode }
  });
  return data.impact ?? {};
}
