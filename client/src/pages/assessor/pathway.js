/**
 * How a class's pathway reads on the assessor's screens.
 *
 * An assessor may hold one of each on the same course — a taught section and
 * an assess-only one — and the two are different jobs: eight quizzes and an
 * examination, or one examination. Every screen that names a class names its
 * pathway with it, so which roster or which register is on screen is never
 * something to work out from the numbers.
 *
 * Only the assess-only one is said. Taught is what a class is unless it says
 * otherwise, and tagging every row with the ordinary case buries the one row
 * that is not.
 */

export const isAssessOnly = (cls) => cls?.mode === "assessOnly";

/** A class's name with its pathway, where the pathway is worth saying. */
export function classLabel(cls) {
  // Empty, not absent, is what an unnamed class arrives as — the server
  // falls back to the course code, so this only catches a class that did
  // not load at all.
  const name = cls?.name || "Unnamed class";
  const notes = [isAssessOnly(cls) ? "assess-only" : "", cls?.active === false ? "off" : ""]
    .filter(Boolean)
    .join(", ");

  return notes ? `${name} (${notes})` : name;
}

/** The same for a list of them, as one line. */
export const classLine = (classes) => (classes ?? []).map(classLabel).join(" · ");
