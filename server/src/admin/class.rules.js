/**
 * The two rules that make a Class a section rather than a loose bag of people.
 *
 *   1. A class has exactly one assessor.
 *   2. A student belongs to at most one class per course.
 *
 * Neither was written down anywhere. `Class` is stored through the raw driver
 * with no schema behind it, so the collection accepted five assessors on one
 * class and the same student in two sections of the same course, and the write
 * path in classes.controller.js was built to tolerate both.
 *
 * Kept apart from the controller, and kept pure, for the reason courseAccess.js
 * splits `authoringRestrictionFrom` from `loadAuthoringRestriction`: the rule is
 * the part worth being sure of, and it can only be exercised cheaply while it
 * has no database in it. The controller does the reading and hands the rows in.
 *
 * ── Why this is not a unique index ──
 *
 * `{ studentIds: 1, courseId: 1 }` declared unique enforces rule 2 exactly —
 * `studentIds` is an array, so a multikey unique index refuses a second class
 * on the same course holding a student the first one has. Checked against this
 * database on a throwaway collection, and it does refuse it.
 *
 * It also refuses something that has to stay legal. A class with no students
 * indexes as a single null key, so the *second* empty section on a course
 * collides with the first — and creating two sections before filling either is
 * the ordinary way an admin works. There is no partial filter that excludes an
 * empty array, so the index would have to be dropped again the first time
 * somebody scheduled two sections in a row. The rule lives here instead, and
 * the existing non-unique index on those fields still serves the lookup.
 */

const asId = (value) => String(value);

/** How many assessors a class holds. One, because a section has one teacher. */
export const ASSESSORS_PER_CLASS = 1;

/**
 * Rule 1. Returns the refusal, or null when the list is fine.
 *
 * Exactly one, not "at most one": a section with nobody in front of it is a
 * timetable entry, not a class, and the students in it would have no one to
 * release their certificates. Zero and two are refused in different words
 * because they are different mistakes.
 *
 * Classes written before this rule may still have none. Those are not judged
 * on every edit — see the caller — or a class with no assessor could not even
 * be renamed, let alone fixed. Sending an assessor list is what gets it asked.
 */
export function assessorCountError(assessorIds) {
  const count = Array.isArray(assessorIds) ? assessorIds.length : 0;
  if (count === ASSESSORS_PER_CLASS) return null;
  return count === 0
    ? "A class needs an assessor. Choose the one who takes this section."
    : "A class has one assessor. Choose a single assessor for this section.";
}

/**
 * Rule 2. Which of `studentIds` are already held by a class on this course.
 *
 * `classes` is every class on the course; `exceptClassId` is the one being
 * saved, which does not count against itself — an edit that leaves a student
 * where they are must not be read as putting them somewhere twice.
 *
 * Returns the clashing student ids paired with the class that has them, so the
 * refusal can name both instead of saying only that something was wrong.
 */
export function studentsHeldElsewhere(classes, studentIds, exceptClassId) {
  const wanted = new Set((studentIds ?? []).map(asId));
  if (wanted.size === 0) return [];

  const clashes = [];
  const seen = new Set();

  for (const cls of classes ?? []) {
    if (exceptClassId && asId(cls._id) === asId(exceptClassId)) continue;

    for (const studentId of cls.studentIds ?? []) {
      const key = asId(studentId);
      // First class found wins the report. A student in three of them is one
      // problem to fix, not three lines saying so.
      if (!wanted.has(key) || seen.has(key)) continue;
      seen.add(key);
      clashes.push({ studentId: key, className: cls.name ?? "another class" });
    }
  }

  return clashes;
}

/**
 * The refusal for rule 2, in the words an admin can act on.
 *
 * `nameOf` turns a student id into a person, because "202300004 is already in
 * IT01" is a sentence someone can go and do something about and a bare id is
 * not. Names up to three of them; past that the count carries it, since a
 * paragraph of names is not more useful than a number.
 */
export function studentClashError(clashes, nameOf = (id) => id) {
  if (clashes.length === 0) return null;

  const listed = clashes
    .slice(0, 3)
    .map(({ studentId, className }) => `${nameOf(studentId)} (${className})`)
    .join(", ");
  const rest = clashes.length - 3;

  return (
    `A student can only be in one class per course. ` +
    `${listed}${rest > 0 ? `, and ${rest} more` : ""} ` +
    `${clashes.length === 1 ? "is" : "are"} already in a class on this course.`
  );
}
