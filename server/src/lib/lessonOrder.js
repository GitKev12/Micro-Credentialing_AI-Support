/**
 * The order a course's lessons are read in — their chapter order.
 *
 * The chapter number lives in the uploaded file's name, not in the title. Every
 * course here is titled by topic ("Arrays", "Looping", "Empowerment") while the
 * file it came from carries the sequence:
 *
 *   CC2-Lec-Chapter-1-Module.pdf              → 1
 *   MODULE-SERVICE-CULTURE-CHAPTER-10.pdf     → 10
 *   TSM3-Module-Week1 (1).pdf                 → 1
 *   EA-week-10-11.pdf                         → 11
 *   UPDATED-AUGUST-3-2021-…-CHAPTER-7.pdf     → 7
 *
 * So the file name is read first, and the title only for a lesson whose file
 * says nothing. Reading the title alone left every course in alphabetical
 * order, which is what "Arrays" first and "Creating Java Programs" second was.
 *
 * It is the *last* number in the name: the prefixes carry numbers of their own
 * — a course code (CC2, TSM3), a revision date (AUGUST-3-2021) — and a week
 * range still sorts by its end, because the ranges do not overlap. A trailing
 * "(1)" from a re-download is dropped first, or it would answer for the chapter.
 *
 * Three screens list these lessons — the student's reader, the assessor's
 * per-student view and the admin's course detail — and they disagreed until
 * this was one function.
 */

/** The file's own name, minus its extension and any "(2)" copy marker. */
function fileStem(fileName) {
  return String(fileName ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
}

/** The last number in a piece of text, or Infinity if it holds none. */
export function numberIn(text) {
  const numbers = String(text ?? "").match(/\d+/g);
  return numbers ? Number(numbers[numbers.length - 1]) : Number.POSITIVE_INFINITY;
}

/**
 * A lesson's chapter number: from its file name, or from its title when the
 * file name holds no number. A plain string is read as a title, for callers
 * that have nothing else.
 */
export function lessonNumber(module) {
  if (module == null || typeof module === "string") return numberIn(module);

  const fromFile = numberIn(fileStem(module.fileName));
  return Number.isFinite(fromFile) ? fromFile : numberIn(module.title);
}

/**
 * Comparator for lessons.
 *
 * Ties settle on the file name and then the title, so two lessons sharing a
 * number keep a stable order rather than whichever one the database returned
 * first. Truthiness rather than `!== 0` on the difference, and deliberately:
 * two unnumbered lessons are both Infinity, and Infinity - Infinity is NaN —
 * returned as the verdict, that sorts nothing at all.
 */
export function byLesson(left, right) {
  const difference = lessonNumber(left) - lessonNumber(right);
  if (difference) return difference;

  const compare = (a, b) =>
    String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true });

  return (
    compare(fileStem(left?.fileName), fileStem(right?.fileName)) ||
    compare(left?.title, right?.title)
  );
}

/** The same, as a sort in place — the shape every caller here wanted. */
export function sortLessons(modules) {
  return modules.sort(byLesson);
}
