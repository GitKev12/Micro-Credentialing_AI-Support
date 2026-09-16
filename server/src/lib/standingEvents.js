import { EventEmitter } from "node:events";

/**
 * Who to wake up when an account's standing changes — the in-process half of
 * the standing stream (see auth.controller.js's streamStanding).
 *
 * Kept apart from lib/suspension.js and lib/courseAccess.js because those
 * answer "what is true now"; this only carries "something changed for this
 * account", so the stream can go re-ask the true answer rather than trusting
 * a payload built somewhere else. One process, one bus — a second server
 * instance would need this on something shared (Mongo change streams, Redis),
 * not this.
 */

const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Wakes any open stream for this account. Call after the write commits. */
export function publishStanding(accountId) {
  if (!accountId) return;
  bus.emit(String(accountId), true);
}

/** Subscribes to that wake-up; returns the way to stop listening. */
export function onStandingChange(accountId, listener) {
  const key = String(accountId);
  bus.on(key, listener);
  return () => bus.off(key, listener);
}
