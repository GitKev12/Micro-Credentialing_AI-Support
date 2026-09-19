/**
 * A quiz the student has started and not handed in.
 *
 * Until a paper is submitted its answers exist only on the screen, so a reload,
 * a closed tab or a dropped connection used to put the student back at a blank
 * paper. This keeps a copy in the browser, written on every change, so opening
 * the quiz again picks up where they left it.
 *
 * The server re-draws the order of the questions and of their choices on every
 * fetch. Answers survive that on their own — they are keyed by item and choice
 * id, never by position — but a paper that came back in a different order would
 * still read as a different paper. So the order is kept too, and put back.
 *
 * It is kept in the browser and deliberately not sent anywhere, the same as the
 * reading position in lessonProgress.js. That is what makes it work through a
 * dropped connection, and it means a different machine starts the paper afresh.
 */

const STORAGE_PREFIX = "capstoneQuizDraft.";

const keyFor = (studentId, assessmentId) => `${STORAGE_PREFIX}${studentId}.${assessmentId}`;

/**
 * What this browser kept of a paper, or null.
 *
 * Keyed by student as well as paper, so two people sharing a machine do not
 * inherit each other's answers. Every access is guarded: a browser set to block
 * site data throws on the accessor itself rather than returning nothing.
 */
export function readQuizDraft(studentId, assessmentId) {
  if (!studentId || !assessmentId) return null;

  try {
    const stored = window.localStorage.getItem(keyFor(studentId, assessmentId));
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" && Array.isArray(parsed.order) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

export function writeQuizDraft(studentId, assessmentId, draft) {
  if (!studentId || !assessmentId) return;

  try {
    window.localStorage.setItem(keyFor(studentId, assessmentId), JSON.stringify(draft));
  } catch (_error) {
    // A private window, or storage the browser has been told to refuse. The
    // quiz still works; a reload will just start it over, as it always did.
  }
}

export function clearQuizDraft(studentId, assessmentId) {
  if (!studentId || !assessmentId) return;

  try {
    window.localStorage.removeItem(keyFor(studentId, assessmentId));
  } catch (_error) {
    // Nothing to do: a browser that refuses storage never kept one.
  }
}

/** The draft for the paper as it stands on screen. */
export function draftOf(assessment, answers, current, startedAt, retakeOf) {
  const items = assessment?.items ?? [];

  return {
    order: items.map((item) => String(item.id)),
    choices: Object.fromEntries(
      items.map((item) => [String(item.id), (item.choices ?? []).map((choice) => String(choice.id))])
    ),
    answers,
    current: items[current] ? String(items[current].id) : null,
    startedAt,
    retakeOf
  };
}

/**
 * Whether a kept draft is still the paper in front of the student.
 *
 * A draft outlives its paper in one way: it was handed in and the page never
 * heard back — the submission landed, the reply was lost to the connection.
 * The mark on the server is what says so.
 *
 * - No mark: nothing was handed in, so the draft is the attempt.
 * - A mark, and the draft is a retake started from that same attempt, which
 *   may still be taken: the retake is what is in progress.
 * - Anything else: the draft was handed in, and the mark is the answer.
 */
export function draftIsOpen(draft, result) {
  if (!draft) return false;
  if (!result) return true;
  return draft.retakeOf != null && draft.retakeOf === result.attempt && Boolean(result.canRetake);
}

/** Sorts a list into the id order saved, leaving anything new at the end. */
function inSavedOrder(list, savedIds) {
  const rank = new Map((Array.isArray(savedIds) ? savedIds : []).map((id, index) => [String(id), index]));

  return list
    .map((entry, index) => ({
      entry,
      at: rank.has(String(entry.id)) ? rank.get(String(entry.id)) : rank.size + index
    }))
    .sort((a, b) => a.at - b.at)
    .map(({ entry }) => entry);
}

/**
 * The fetched paper put back the way the student left it: the same order of
 * questions and of choices, their answers, and the question they were on.
 *
 * Read against the paper the server sent, not trusted over it. A question the
 * assessor has since taken off is dropped with its answer, a new one lands at
 * the end unanswered, and an answer naming a choice the question no longer
 * has is dropped rather than sent back to be marked.
 */
export function restoreQuizDraft(assessment, draft) {
  const items = inSavedOrder(assessment?.items ?? [], draft?.order).map((item) => ({
    ...item,
    choices: inSavedOrder(item.choices ?? [], draft?.choices?.[String(item.id)])
  }));

  const saved = draft?.answers && typeof draft.answers === "object" ? draft.answers : {};
  const answers = {};
  items.forEach((item) => {
    const choice = saved[String(item.id)];
    if (choice == null) return;
    const option = item.choices.find((entry) => String(entry.id) === String(choice));
    if (option) answers[item.id] = option.id;
  });

  const at = items.findIndex((item) => String(item.id) === String(draft?.current));

  return {
    assessment: { ...assessment, items },
    answers,
    current: at === -1 ? 0 : at
  };
}
