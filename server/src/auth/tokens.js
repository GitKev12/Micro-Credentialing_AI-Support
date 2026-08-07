import jwt from "jsonwebtoken";

/**
 * Session tokens.
 *
 * These used to be `base64(role:id:issuedAt)` — readable, and just as writable
 * by anyone who knew the shape, which meant any caller could mint themselves an
 * admin session. They are now HS256-signed, so a token the server did not issue
 * fails verification.
 *
 * The secret has no fallback on purpose. A default would sign tokens that every
 * copy of this code could also sign, which is the same as not signing them; the
 * server refusing to boot is the louder and safer failure.
 */

const TOKEN_TTL = "12h";
const ISSUER = "capstone-project-dev";

function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }

  return secret;
}

/** Called at boot so a missing secret fails on start, not on first login. */
export function assertAuthSecret() {
  getSecret();
}

export function signAuthToken(account, role) {
  return jwt.sign({ role }, getSecret(), {
    subject: String(account._id),
    issuer: ISSUER,
    expiresIn: TOKEN_TTL
  });
}

/**
 * Returns the session carried by a token, or null if the token is missing,
 * expired, tampered with, or signed by someone else. Callers treat every null
 * the same way — there is nothing useful, or safe, in telling the caller which
 * of those it was.
 */
export function verifyAuthToken(token) {
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getSecret(), { issuer: ISSUER });
    return { id: payload.sub, role: payload.role };
  } catch (_error) {
    return null;
  }
}

/** Pulls the bearer token out of an Authorization header. */
export function readBearerToken(request) {
  const header = request.get("authorization") || "";
  const [scheme, value] = header.split(" ");
  if (!value || scheme.toLowerCase() !== "bearer") return "";
  return value.trim();
}

/**
 * The same token, but also accepted from `?token=`.
 *
 * Certificate PDFs, lesson files, course art and figures are reached by the
 * browser itself — an `<a href>` or an `<img src>` — and a browser navigation
 * sends no Authorization header. A query token is the usual way round that.
 *
 * It is the weaker of the two: URLs land in history, referrers and access
 * logs. Only the file routes accept it, and it should give way to short-lived
 * single-use download links if these ever carry anything more sensitive than a
 * student's own certificate.
 */
export function readRequestToken(request) {
  return readBearerToken(request) || String(request.query?.token || "").trim();
}
