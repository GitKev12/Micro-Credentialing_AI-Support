/**
 * How long a paper runs, as the two controls on the generate screen decide it.
 *
 * Its own module because it is a rule rather than a piece of the screen: the
 * page it serves pulls in the API client and half of react-router, and a rule
 * this small should be readable — and testable — without any of that.
 */

/** The default length of a final examination, until an assessor says otherwise. */
export const DEFAULT_MINUTES = 90;

/** The ceiling the Minutes field itself allows. */
const MAX_MINUTES = 600;

/**
 * The clock a paper runs to, in minutes, or null for one with none.
 *
 * Nought is how the assessor says "no limit" — it is what the field's own
 * minimum is there for — and null is how the server stores that, since "no
 * limit" and "no time at all" are opposite answers.
 */
export function clampMinutes(value) {
  const minutes = Math.floor(Number(value) || 0);
  return minutes > 0 ? Math.min(MAX_MINUTES, minutes) : null;
}

/**
 * What the two controls add up to.
 *
 * The box carries the department's figure and the field carries the assessor's
 * own, so whichever is in force is what gets asked for. Unticking used to send
 * null whatever was typed — the field appeared, took a number, and the paper
 * was saved untimed — which made the one control for setting a clock the one
 * sure way of not setting one.
 */
export function timeLimitFor({ timed, minutes }) {
  return timed ? DEFAULT_MINUTES : clampMinutes(minutes);
}
