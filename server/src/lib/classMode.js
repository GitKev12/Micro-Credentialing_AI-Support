/**
 * Which pathway a class runs.
 *
 * A course can be credentialed two ways. `taught` is the original one: read
 * the lessons, pass each lesson's quiz, earn its badge, and the final opens
 * once all of them are behind you. `assessOnly` is for a candidate who already
 * has the competence — one examination, no quizzes, no badges, the credential
 * follows from the paper.
 *
 * It is a property of the class rather than the course because the same course
 * is credentialed both ways at once: one section taught, another assessed. The
 * class is already what decides which paper a student sits (classPapers.js) and
 * already holds a student to one per course (class.rules.js, rule 2), so the
 * pathway rides along with both and needs no rule of its own to stop somebody
 * being in two.
 *
 * Absent reads as `taught`. Every class written before the field existed was a
 * taught one, so the missing value is not unknown — it is the answer.
 */

export const CLASS_MODES = ["taught", "assessOnly"];

export const TAUGHT = "taught";
export const ASSESS_ONLY = "assessOnly";

/** The pathway a stored class runs, defaulting the way the old documents read. */
export function classMode(cls) {
  return cls?.mode === ASSESS_ONLY ? ASSESS_ONLY : TAUGHT;
}

/** Whether this class goes straight to the examination. */
export function isAssessOnly(cls) {
  return classMode(cls) === ASSESS_ONLY;
}

/** A pathway as it arrived from a form, or null when the body did not say. */
export function toClassMode(value) {
  return CLASS_MODES.includes(value) ? value : TAUGHT;
}

/** What the pathway is called on screen. */
export const MODE_LABELS = {
  [TAUGHT]: "Taught and assessed",
  [ASSESS_ONLY]: "Assess-only"
};
