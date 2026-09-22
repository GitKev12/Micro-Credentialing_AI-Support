/**
 * How long a paper runs, as the control on the generate screen decides it.
 *
 * Its own module because it is a rule rather than a piece of the screen: the
 * page it serves pulls in the API client and half of react-router, and a rule
 * this small should be readable — and testable — without any of that.
 *
 * Two answers: a length, or none. It used to be a tickbox carrying the
 * department's ninety minutes and a Minutes field carrying the assessor's own,
 * and a paper with no clock at all had no control of its own — you reached it
 * by unticking the box and typing nought. The most permissive setting a paper
 * has was the one nobody could find.
 *
 * Ninety is still what the field opens on for a final. It is a starting figure
 * now rather than an answer of its own, which is the difference between
 * offering a length and making the assessor choose between theirs and ours.
 */

/** What the Minutes field opens on, and what a final is written with. */
export const DEFAULT_MINUTES = 90;

/** The ceiling the Minutes field itself allows. */
const MAX_MINUTES = 600;

/* Strings rather than a boolean because untimed is a thing a paper is, not the
   absence of a setting — and because the two read as two answers on screen. */
export const TIMED = "timed";
export const UNTIMED = "untimed";

/**
 * A typed length held to the field's own bounds, or null where there is none.
 *
 * Null is how the server stores an untimed paper, since "no limit" and "no
 * time at all" are opposite answers and nought cannot mean both.
 */
export function clampMinutes(value) {
  const minutes = Math.floor(Number(value) || 0);
  return minutes > 0 ? Math.min(MAX_MINUTES, minutes) : null;
}

/**
 * What the control sends, in minutes, or null for a paper with no clock.
 *
 * The chosen answer decides, and only Timed reads the number beside it — so a
 * figure left in the field cannot follow the assessor onto the other answer,
 * which is the mistake the old pair of controls made in both directions.
 */
export function timeLimitFor({ mode, minutes }) {
  return mode === UNTIMED ? null : clampMinutes(minutes);
}

/** Which row an assessor finds already chosen when they open a paper. */
export function limitModeFor(timeLimitMinutes) {
  return clampMinutes(timeLimitMinutes) === null ? UNTIMED : TIMED;
}

/**
 * Whether the control has been answered fully.
 *
 * Timed with an empty field is the one incomplete state: it would clamp to
 * null and save an untimed paper, which is a different answer from the one
 * showing on screen. The screen stops on it rather than guessing.
 */
export function limitReady({ mode, minutes }) {
  return mode === UNTIMED || clampMinutes(minutes) !== null;
}
