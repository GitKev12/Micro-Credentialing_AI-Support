/**
 * The three questions both consoles ask of a StudentResult.
 *
 * The assessor's screens report their own backlog and the admin's screens
 * report the same backlog from the other direction, so "still to grade" has to
 * mean one thing. Defined once here rather than once per console, where one
 * copy could quietly start counting a released paper or overlooking a flag the
 * assessor never ruled on — and the two screens would then disagree about the
 * same person with no way to tell which was right.
 */

/** A paper the assessor has finished with: its grade is out. */
export const isReleased = (result) => result?.review?.status === "released";

/** Whether the AI managed to grade this paper at all. */
export const aiStatusOf = (result) => result?.aiGrading?.status ?? "unavailable";

