/**
 * What is closed for the person signed in, as the app last heard it.
 *
 * A screen is told what it may do when it loads, and then somebody in another
 * console changes their mind: an administrator suspends the account, an
 * assessor closes one course for one student. Nothing about the page the
 * student is looking at knows that has happened, and until now nothing told
 * it — they carried on reading, finishing lessons and handing in papers until
 * they happened to reload.
 *
 * So the answer is kept in one place, outside React, and every screen reads it
 * from here. It is written to from two directions:
 *
 *   — the axios layer, when a request comes back refused because the account
 *     is suspended. Every action a suspended student takes is refused, so the
 *     first thing they press is what tells the app.
 *   — the watcher, which asks the server every few seconds what is closed, so
 *     a student who is doing nothing is told as well.
 *
 * Deliberately free of imports. `services/api.js` reports into it, so anything
 * this module pulled in would be pulled into the axios layer too — and axios
 * importing a screen, or React, is the cycle `session.js` is split out to
 * avoid.
 */

const EMPTY = { account: null, courses: {}, known: false };

let current = EMPTY;
const listeners = new Set();

/** The standing as it stands. One frozen object, replaced rather than edited. */
export function currentStanding() {
  return current;
}

/** Calls back on every change, and hands back the way to stop listening. */
export function watchStanding(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next) {
  current = next;
  // A copy, so a listener that unsubscribes in its own callback — which the
  // dialog does when it signs out — cannot shorten the list being walked.
  for (const listener of [...listeners]) listener(current);
}

/**
 * The account has been suspended, learnt from a refusal rather than asked for.
 *
 * `refusal` is the body of the 423 (see server lib/suspension.js). Its sentence
 * is the server's, not ours: the same words reach the student whichever of the
 * two consoles they were in, and there is one place to change them.
 *
 * Reporting the same refusal twice changes nothing. Every request in flight
 * when an account is suspended comes back refused, and a screen with four of
 * them would otherwise re-render four times on its way to being replaced.
 */
export function reportAccountSuspension(refusal) {
  const message = String(refusal?.message || "").trim();
  if (current.account?.message === message) return;

  publish({
    ...current,
    account: { message, by: refusal?.by ?? "admin" }
  });
}

/**
 * What the server last said about this student's courses.
 *
 * `known` turns true with the first answer and stays true. Until then a screen
 * uses what it was given when it loaded — the absence of an answer is not the
 * same as being told nothing is closed, and a page that read it that way would
 * reopen a shut course for as long as it took the first request to land.
 */
export function reportCourseStanding(courses) {
  const byCourse = {};

  for (const entry of Array.isArray(courses) ? courses : []) {
    if (!entry?.courseId) continue;
    byCourse[String(entry.courseId)] = {
      reason: String(entry.reason || "").trim(),
      by: entry.by ?? null
    };
  }

  // The watcher asks every few seconds and the answer is nearly always the
  // same one. Publishing it regardless would re-render every screen reading
  // this, on a timer, for no change at all.
  if (current.known && sameCourses(current.courses, byCourse)) return;

  publish({ ...current, courses: byCourse, known: true });
}

function sameCourses(before, after) {
  const ids = Object.keys(after);
  if (ids.length !== Object.keys(before).length) return false;

  return ids.every(
    (id) => before[id]?.reason === after[id].reason && before[id]?.by === after[id].by
  );
}

/** Signing out. The next person at this browser starts from nothing known. */
export function clearStanding() {
  publish(EMPTY);
}
