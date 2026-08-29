/**
 * A course's run dates — when it starts and when it ends.
 *
 * Kept apart from the controller because this is the whole of the rule and it
 * is worth testing on its own: two dates that have to parse, have to stay in
 * order, and have to both be there.
 *
 * "Both there" is enforced from the moment a request touches either of them —
 * on create always, and on an edit that mentions a date at all. A course
 * written before the field existed still has neither, and can still be edited
 * for anything else; the first edit that touches its dates has to finish the
 * job. That way nothing already stored breaks, and nothing new is half-dated.
 *
 * Dates arrive from an <input type="date"> as "YYYY-MM-DD" and are stored as
 * Date objects at UTC midnight — the day is the fact, not the hour, so every
 * reader has to format them in UTC to get the day back that was typed in.
 */

/** Blank in any of the forms a form can send it. */
const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === "";

/**
 * One date field: a Date, or null to clear it.
 *
 * `null` is a value here rather than an omission — clearing a course's end date
 * is a thing an admin does, and it has to be distinguishable from not having
 * mentioned the field at all (which is what the `in body` checks upstream do).
 */
export function readCourseDate(value, label) {
  if (isBlank(value)) return { value: null };

  const text = String(value).trim();
  // A bare "YYYY-MM-DD" parses as UTC midnight; anything else the platform
  // understands is accepted too, then normalised to the day it names.
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);

  if (Number.isNaN(parsed.getTime())) {
    return { error: `${label} is not a date we can read. Use the date picker.` };
  }

  return {
    value: new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
    )
  };
}

/**
 * Both dates, checked against each other.
 *
 * `current` is the course as stored, so a PATCH that moves only the end date is
 * still checked against the start date already on the document — the two fields
 * are one rule, and a request that sends half of it cannot be judged on its own.
 *
 * `required` forces the pair to be complete even when the body mentioned
 * neither, which is what a create needs.
 *
 * Returns `{ dates }` with only the keys the body actually mentioned, or
 * `{ error }` with the message the admin should see.
 */
export function readCourseDates(body = {}, current = {}, { required = false } = {}) {
  const dates = {};

  for (const [key, label] of [
    ["startsOn", "The start date"],
    ["endsOn", "The end date"]
  ]) {
    if (!(key in body)) continue;

    const read = readCourseDate(body[key], label);
    if (read.error) return { error: read.error };
    dates[key] = read.value;
  }

  const startsOn = "startsOn" in dates ? dates.startsOn : toDate(current.startsOn);
  const endsOn = "endsOn" in dates ? dates.endsOn : toDate(current.endsOn);

  // Touching either date means finishing the pair: a course with only one of
  // them has a deadline or a start, which is not a duration and reads as a bug
  // on every card that tries to show one.
  if ((required || Object.keys(dates).length > 0) && !(startsOn && endsOn)) {
    return { error: "A course needs both a start date and an end date." };
  }

  if (startsOn && endsOn && endsOn.getTime() < startsOn.getTime()) {
    return { error: "The end date cannot be before the start date." };
  }

  return { dates };
}

/** Whatever the document holds, as a Date — or null if it holds nothing usable. */
export function toDate(value) {
  if (isBlank(value)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The stored value as the API reports it: an ISO string, or null. */
export function toIsoDay(value) {
  return toDate(value)?.toISOString() ?? null;
}
