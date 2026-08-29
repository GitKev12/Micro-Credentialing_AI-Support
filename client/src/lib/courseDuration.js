/**
 * A course's run — when it starts, when it ends, and how long that is.
 *
 * Three screens show this (the admin catalog, the student's course cards and
 * the assessor's class register), so the wording lives here rather than being
 * spelled three slightly different ways.
 *
 * Everything is read in UTC. The server stores each date at UTC midnight
 * because the day is the fact, not the hour; formatting it in the reader's own
 * zone would shift a course that starts on the 4th to the 3rd for anyone west
 * of Greenwich.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const UTC = { timeZone: "UTC" };

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const day = (date, withYear) =>
  date.toLocaleDateString(undefined, {
    ...UTC,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {})
  });

/**
 * "Aug 4 – Oct 10, 2026", or the half that is known.
 *
 * The year is printed once when both ends share it and on both when they do
 * not — a run that crosses New Year is exactly the case where leaving it off
 * would mislead.
 */
export function formatCourseRange(course) {
  const startsOn = asDate(course?.startsOn);
  const endsOn = asDate(course?.endsOn);

  if (startsOn && endsOn) {
    const sameYear = startsOn.getUTCFullYear() === endsOn.getUTCFullYear();
    return `${day(startsOn, !sameYear)} – ${day(endsOn, true)}`;
  }

  if (startsOn) return `From ${day(startsOn, true)}`;
  if (endsOn) return `Until ${day(endsOn, true)}`;
  return null;
}

/**
 * "10 weeks" — how long the run is, counting both end days.
 *
 * Only a course with both dates has a length; one open end is a start or a
 * deadline, not a duration. Under a week it is counted in days, because
 * "1 week" for a three-day course is a rounding that reads as a fact.
 */
export function formatCourseLength(course) {
  const startsOn = asDate(course?.startsOn);
  const endsOn = asDate(course?.endsOn);
  if (!startsOn || !endsOn) return null;

  const days = Math.round((endsOn.getTime() - startsOn.getTime()) / DAY_MS) + 1;
  if (days < 1) return null;
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"}`;

  const weeks = Math.round(days / 7);
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

/** "Aug 4 – Oct 10, 2026 · 10 weeks", or null when the course has no dates. */
export function formatCourseRun(course) {
  const range = formatCourseRange(course);
  if (!range) return null;

  const length = formatCourseLength(course);
  return length ? `${range} · ${length}` : range;
}

/** What an <input type="date"> wants: "YYYY-MM-DD", or "" for an empty field. */
export function toDateInput(value) {
  const date = asDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Whether the pair is in order — the same rule the server enforces. */
export function isRunInOrder(startsOn, endsOn) {
  const start = asDate(startsOn);
  const end = asDate(endsOn);
  if (!start || !end) return true;
  return end.getTime() >= start.getTime();
}

/**
 * Whether the course's run is over.
 *
 * The end date is the last day of the run, not the first day after it — the
 * same reading that makes a course starting and ending on the 4th one day
 * long. Compared in UTC, because the stored day is what was typed in.
 *
 * The server sends `ended` on every course it serves and enforces it on every
 * endpoint that writes to one, so a screen reads `course.ended` and falls back
 * to this — the client works out what to draw, never what is allowed.
 */
export function hasCourseEnded(course, at = new Date()) {
  const endsOn = asDate(course?.endsOn);
  if (!endsOn) return false;

  const dayOf = (date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return dayOf(at) > dayOf(endsOn);
}

/** "Ended Oct 10, 2026" — what the card says once the run is over. */
export function formatCourseEnded(course) {
  const endsOn = asDate(course?.endsOn);
  return endsOn ? `Ended ${day(endsOn, true)}` : "Ended";
}
