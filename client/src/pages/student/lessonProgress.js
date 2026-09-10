/**
 * How far a student has read — into a lesson, and into each of its sections.
 *
 * The server records one thing about a lesson: whether it is finished
 * (ModuleProgress). That is the record, and it is what the ticks, the course
 * card and the quiz gates turn on. This is the other half — how far through an
 * unfinished lesson the reader has got — which is a reading position rather
 * than an achievement.
 *
 * It is kept in the browser and deliberately not sent anywhere. Storing it
 * would mean a write on every scroll, it decides nothing (a lesson still
 * completes by reaching the end, and the server still refuses that write on a
 * closed course), and a figure nobody grades is not worth a round trip. A
 * finished lesson reads 100 off the record instead of off wherever the reader
 * was left, so the number and the tick beside it can never disagree.
 *
 * Being per-browser, it can come back empty — a different machine, a private
 * window, cleared site data. That reads as "not started", which is the honest
 * answer from a device that has never seen this lesson opened.
 */

const STORAGE_PREFIX = "capstoneReading.";

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * How far down the lesson the reader has been, as a percentage of its height.
 *
 * `depth` is the deepest the *bottom* edge of the pane has reached, not where
 * it is now: scrolling back up to re-read something is not losing progress.
 *
 * Measuring from the bottom edge rather than the top is what makes a lesson
 * short enough to fit on screen read 100% the moment it opens — which is the
 * same rule the completion check already applies to it, so the percentage and
 * the tick arrive together rather than one before the other.
 */
export function lessonPercent(depth, scrollHeight) {
  if (!Number.isFinite(depth) || !Number.isFinite(scrollHeight) || scrollHeight <= 0) return 0;
  return clamp((depth / scrollHeight) * 100);
}

/**
 * How much of one section has passed under that same edge.
 *
 * `section` is { top, height } in the reader's own scroll coordinates — the
 * component measures those, because only it knows where the headings landed.
 */
export function sectionPercent(section, depth) {
  const height = Number(section?.height);
  const top = Number(section?.top);
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(top)) return 0;
  if (!Number.isFinite(depth)) return 0;
  return clamp(((depth - top) / height) * 100);
}

/** The same question asked of every measured section at once. */
export function sectionPercents(geometry, depth) {
  const percents = {};
  (Array.isArray(geometry) ? geometry : []).forEach((section) => {
    if (section?.id == null) return;
    percents[section.id] = sectionPercent(section, depth);
  });
  return percents;
}

/**
 * One lesson's progress: half of it is reading, half is passing its quiz.
 *
 * A lesson is two pieces of work, not one. Reading it to the end used to be the
 * whole of the figure, so a lesson sat at 100% with its quiz untouched — and
 * the ring in the rail said finished about a lesson that was not.
 *
 * Half each rather than a weighting, because that is what the rest of the app
 * already counts: a course is worth its lessons plus a quiz for each of them
 * plus a final, all as single units (see progressSummary on the server). One
 * lesson is two of those units, so each is worth half of it. A quiz that is
 * not there to pass yet leaves the lesson at 50 — which is the honest figure
 * for a lesson whose second half nobody has released.
 */
export function lessonShare(readPercent, quizPassed) {
  const read = Number.isFinite(readPercent) ? Math.max(0, Math.min(100, readPercent)) : 0;
  // Floored, not rounded. Rounding gave half of 99 as 50, so a lesson with a
  // sliver still unread reported itself finished the moment its quiz was
  // passed — and `finished` is what draws the tick and the word "Completed".
  // Only a whole half may count as one.
  return Math.min(100, Math.floor(read / 2) + (quizPassed ? 50 : 0));
}

/**
 * Folds a fresh measurement into what was already known, keeping the highest
 * figure for the lesson and for each of its sections.
 *
 * Reading does not go backwards, and it must not appear to: the pane is
 * re-measured whenever its contents change size — an image finishing loading
 * is enough — and a lesson that grew taller under a student who has not moved
 * would otherwise report them as having read less of it than a moment ago.
 *
 * Returns `previous` itself when nothing moved, so the caller can compare by
 * reference and skip the re-render entirely. That matters here: this runs on
 * every scroll event, and the pane it would re-render is the one being
 * scrolled.
 */
export function mergeReading(previous, measured) {
  const previousPercent = previous?.percent ?? 0;
  const previousSections = previous?.sections ?? {};

  const percent = Math.max(previousPercent, measured?.percent ?? 0);

  let sections = previousSections;
  Object.entries(measured?.sections ?? {}).forEach(([id, value]) => {
    if (!(value > (previousSections[id] ?? 0))) return;
    // Copied once, and only once something actually rose.
    if (sections === previousSections) sections = { ...previousSections };
    sections[id] = value;
  });

  if (percent === previousPercent && sections === previousSections) return previous;
  return { percent, sections };
}

/**
 * What this browser remembers of a student's reading.
 *
 * Keyed by student so two people sharing a machine do not inherit each other's
 * positions. Every access is guarded: a browser set to block site data throws
 * on the accessor itself rather than returning nothing.
 */
export function readStoredReading(studentId) {
  if (!studentId) return {};

  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${studentId}`);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

export function writeStoredReading(studentId, reading) {
  if (!studentId) return;

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${studentId}`, JSON.stringify(reading));
  } catch (_error) {
    // A private window, or storage the browser has been told to refuse. The
    // percentages still work for this visit; they just will not outlive it.
  }
}
