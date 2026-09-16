import { EventEmitter } from "node:events";

/**
 * Who to wake up when one assessment's results change — the in-process half
 * of the results stream (see assessors/assessments.controller.js's
 * streamAssessmentResults).
 *
 * The assessor's Results screen used to be read once, on load: a student
 * opening or handing in the same paper somebody was already reviewing left
 * that screen showing what was true when it was fetched. This is the bus that
 * tells an open screen a row underneath it just changed, keyed by assessment
 * rather than by account — the assessor is the one watching, but every
 * student taking that paper is the one moving it.
 *
 * Same shape as lib/standingEvents.js, kept as its own file rather than a
 * shared generic bus because the two answer different questions: an account
 * changed vs. a paper changed. One process, one bus — see standingEvents.js
 * for what a second instance would need instead.
 */

const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Wakes any open stream for this assessment. Call after the write commits. */
export function publishResults(assessmentId) {
  if (!assessmentId) return;
  bus.emit(String(assessmentId), true);
}

/** Subscribes to that wake-up; returns the way to stop listening. */
export function onResultsChange(assessmentId, listener) {
  const key = String(assessmentId);
  bus.on(key, listener);
  return () => bus.off(key, listener);
}
