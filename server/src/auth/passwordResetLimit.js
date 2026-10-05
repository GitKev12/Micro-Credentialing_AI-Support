// Same idea as signupLimit.js: a count per IP address, kept in memory, so a
// restart clears it and several API instances would not share it.
export const RESET_WINDOW_MS = 15 * 60 * 1000;
export const MAX_OTP_REQUESTS = 5;
export const MAX_RESET_TRIES = 10;
const MAX_IPS = 10000;

function createIpLimit(max, message) {
  const attempts = new Map();

  function refuse(request, response, now = Date.now()) {
    for (const [ip, entry] of attempts) {
      if (now - entry.firstAt >= RESET_WINDOW_MS) attempts.delete(ip);
    }
    const ip = request.ip || request.socket?.remoteAddress || "unknown";
    const entry = attempts.get(ip);
    // When the table is full, refuse new IPs rather than dropping old ones.
    if ((!entry && attempts.size >= MAX_IPS) || entry?.count >= max) {
      response.set?.("Retry-After", String(Math.ceil(
        (entry ? entry.firstAt + RESET_WINDOW_MS - now : RESET_WINDOW_MS) / 1000
      )));
      return response.status(429).json({ message });
    }
    attempts.set(ip, { firstAt: entry?.firstAt ?? now, count: (entry?.count ?? 0) + 1 });
    return null;
  }

  return { refuse, clear: () => attempts.clear() };
}

// Asking for an OTP sends an email, so it gets the tighter limit.
const otpRequests = createIpLimit(MAX_OTP_REQUESTS, "Too many OTP requests. Try again in 15 minutes.");
const resetTries = createIpLimit(MAX_RESET_TRIES, "Too many tries. Try again in 15 minutes.");

// Same limits for signup code verification: sending codes and verifying tries.
const codeRequests = createIpLimit(MAX_OTP_REQUESTS, "Too many code requests. Try again in 15 minutes.");
const codeVerifyTries = createIpLimit(MAX_RESET_TRIES, "Too many verification tries. Try again in 15 minutes.");

export const refuseOtpRequestIfLimited = otpRequests.refuse;
export const refuseResetIfLimited = resetTries.refuse;
export const refuseCodeRequestIfLimited = codeRequests.refuse;
export const refuseCodeVerifyIfLimited = codeVerifyTries.refuse;

export function resetPasswordResetLimits() {
  otpRequests.clear();
  resetTries.clear();
  codeRequests.clear();
  codeVerifyTries.clear();
}
