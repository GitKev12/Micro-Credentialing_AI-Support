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

/**
 * What deleting a class would change — `{ students, assessors, unenroll,
 * unassign }`. Deleting a class removes no accounts; it unenrols/unassigns only
 * the people no other class still holds on that course.
 */
export async function fetchClassImpact(classId) {
  const { data } = await api.get(`/admin/classes/${classId}/impact`);
  return data.impact ?? {};
}

export async function deleteClass(classId) {
  const { data } = await api.delete(`/admin/classes/${classId}`);
  return data.removed ?? {};
}
