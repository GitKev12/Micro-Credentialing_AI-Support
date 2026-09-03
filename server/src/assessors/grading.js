/**
 * The one question both consoles ask of a StudentResult.
 *
 * A paper used to be marked twice: once against the key when it was handed in,
 * and again by an assessor who could override any item and then release the
 * grade. Nothing between those two steps counted — a score existed but was
 * provisional, a credential waited on a release, and every screen had to say
 * which of the two marks it meant.
 *
 * The second step is gone. A paper is marked against its key at hand-in and
 * that mark is final, so there is one score and no state to read alongside it.
 * Defined here rather than in each console because the assessor's screens, the
 * admin's screens and the student's own all have to report the same number.
 */

/** What a paper scored. Marked at hand-in, and final there. */
export const scoreOf = (result) => Number(result?.aiGrading?.score ?? 0);

/** Whether that score cleared the paper's pass mark. */
export function passedResult(result, assessment) {
  const passMark = Number(assessment?.passMark);
  if (!result || !Number.isFinite(passMark)) return false;
  return scoreOf(result) >= passMark;
}
