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

import { toAssessmentSummary } from "../assessments/assessments.format.js";

/** What a paper scored. Marked at hand-in, and final there. */
export const scoreOf = (result) => Number(result?.aiGrading?.score ?? 0);

/** Whether that score cleared the paper's pass mark. */
export function passedResult(result, assessment) {
  const passMark = Number(assessment?.passMark);
  if (!result || !Number.isFinite(passMark)) return false;
  return scoreOf(result) >= passMark;
}

/**
 * Whether one of these submissions is a final exam this student has passed.
 *
 * The last of the three things a course is made of. Its lessons are counted
 * off ModuleProgress and its quizzes off passedFromResults (badges.service),
 * and both of those already had a home; the final had none, because until the
 * course figure counted it nobody had to ask.
 *
 * Asked of submissions already in hand rather than of the database, so a
 * screen showing a whole roster reads every student's finals out of the one
 * query it already made.
 */
export function finalPassedFrom(results, assessmentById) {
  return (results ?? []).some((result) => {
    // A retired attempt decides nothing, here as everywhere else.
    if (result.superseded === true) return false;

    const assessment = assessmentById.get(String(result.assessmentId));
    if (!assessment) return false;

    // Normalised rather than read raw: a paper written while assessments still
    // held a bank carries the pass mark of the shorter paper drawn out of it.
    const summary = toAssessmentSummary(assessment);
    if (!summary || summary.scope !== "final") return false;

    return passedResult(result, summary);
  });
}
