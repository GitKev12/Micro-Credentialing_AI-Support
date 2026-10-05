// Single-process protection: restarts clear the counters; multiple API instances
// do not share them. Use a shared store before scaling out.
export const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
export const MAX_SIGNUPS = 5;
export const MAX_SIGNUP_IPS = 10000;
const attempts = new Map();

export function refuseSignupIfLimited(request, response, now = Date.now()) {
  for (const [ip, entry] of attempts) {
    if (now - entry.firstAt >= SIGNUP_WINDOW_MS) attempts.delete(ip);
  }
  const ip = request.ip || request.socket?.remoteAddress || "unknown";
  const entry = attempts.get(ip);
  // Fail closed at capacity rather than evicting an IP and reopening its quota.
  if ((!entry && attempts.size >= MAX_SIGNUP_IPS) || entry?.count >= MAX_SIGNUPS) {
    response.set?.("Retry-After", String(Math.ceil(
      (entry ? entry.firstAt + SIGNUP_WINDOW_MS - now : SIGNUP_WINDOW_MS) / 1000
    )));
    return response.status(429).json({ message: "Too many signup attempts. Try again later." });
  }
  attempts.set(ip, { firstAt: entry?.firstAt ?? now, count: (entry?.count ?? 0) + 1 });
  return null;
}

export function resetSignupLimit() {
  attempts.clear();
}
