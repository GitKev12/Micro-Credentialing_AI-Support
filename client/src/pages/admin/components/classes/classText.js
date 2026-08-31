import { plural } from "../../lib/format";

/** The schedule as one line — "MWF · 09:00–10:00 · Lab 201", or nothing. */
export function scheduleSummary(schedule) {
  const parts = [schedule?.days, schedule?.time, schedule?.room]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.join(" · ");
}

/**
 * What deleting a class changes. It destroys the class row and nothing else —
 * no account, no completion. What it *changes* is enrolment: the people no other
 * class still holds on this course are unenrolled or unassigned, and that is the
 * half worth spelling out, since "delete" on its own reads like it removes them.
 */
export function classLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) return ["this class and its schedule"];
  return ["this class, its roster tags and schedule"];
}

export function classKeeps(impact) {
  if (!impact || impact.unknown) return [];
  return [
    impact.unenroll
      ? `${plural(impact.unenroll, "student")} — unenrolled from the course, account and records stay`
      : "",
    impact.unassign
      ? `${plural(impact.unassign, "assessor")} — unassigned from the course, account stays`
      : ""
  ].filter(Boolean);
}
