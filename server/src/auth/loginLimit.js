/**
 * Stops password guessing: after too many wrong passwords for one account from
 * one network address, sign-in is refused for a while.
 *
 * Counted per account AND address, so a classroom on one Wi-Fi doesn't lock
 * each other out, and a stranger can't lock out someone else's account from
 * their own address. Kept in memory: the server runs as one instance, and a
 * restart simply clears it.
 */

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

// key -> { failures, firstAt }
const attempts = new Map();

function keyFor(request, identifier) {
  return `${request.ip}|${String(identifier).trim().toLowerCase()}`;
}

// Drops entries whose window is over, so the map doesn't grow forever.
function forgetOld(now) {
  for (const [key, entry] of attempts) {
    if (now - entry.firstAt >= WINDOW_MS) attempts.delete(key);
  }
}

/** Minutes left on the lockout, or 0 when this sign-in may go ahead. */
export function lockedMinutes(request, identifier, now = Date.now()) {
  forgetOld(now);
  const entry = attempts.get(keyFor(request, identifier));
  if (!entry || entry.failures < MAX_FAILURES) return 0;
  return Math.ceil((entry.firstAt + WINDOW_MS - now) / 60000);
}

export function noteFailure(request, identifier, now = Date.now()) {
  const key = keyFor(request, identifier);
  const entry = attempts.get(key) ?? { failures: 0, firstAt: now };
  entry.failures += 1;
  attempts.set(key, entry);
}

/** A correct password clears the count. */
export function noteSuccess(request, identifier) {
  attempts.delete(keyFor(request, identifier));
}

/** Sends the refusal; returns null when not locked. */
export function refuseIfLocked(request, response, identifier) {
  const minutes = lockedMinutes(request, identifier);
  if (minutes === 0) return null;
  return response.status(429).json({
    message: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
  });
}

/** For tests. */
export function resetLoginLimit() {
  attempts.clear();
}
