import mongoose from "mongoose";
import { idCandidates } from "./mongo.js";

/**
 * Suspending an *account* — the admin console's lock, on students and assessors
 * alike.
 *
 * It is a real lock and not a label: `loginUser` refuses a suspended account
 * (see auth/auth.controller.js), and every guarded route refuses one that is
 * already signed in (`loadAccountSuspension`, below, called from
 * middleware/auth.js). Nothing is deleted, no enrolment moves, nothing they
 * have earned is touched, and clearing it restores them exactly as they were.
 *
 * The second of those is what makes it a lock rather than a door bolted behind
 * somebody already inside. A session token is good for twelve hours and is
 * checked by its signature alone, so a student suspended at ten past nine
 * carried on reading, finishing lessons and handing in papers until they
 * happened to sign out — the console said they were suspended and the API went
 * on serving them. The flag is now read on the way in to every request.
 *
 * ── Not the same thing as a course suspension ──
 *
 * There are two suspensions in this system and they are easy to run together.
 * This one is on the account: no sign-in, anywhere, and only an admin may do
 * it. The other is a student's place in one course, which an assessor closes
 * from their roster — that person still signs in and still has their other
 * courses, they simply cannot open this one. It lives in lib/courseAccess.js,
 * is recorded on `Class.suspendedStudentIds`, and never touches the field
 * written here.
 *
 * Only `readSuspendedFlag` is shared between the two, because both are asked
 * the same question by a request body.
 */

/**
 * What a request body means by `suspended`.
 *
 * Returns null when the field is absent — which is not the same as `false`, so
 * callers must test for null rather than for falsiness before treating a
 * missing field as "let them back in".
 */
export function readSuspendedFlag(body) {
  if (!body || !("suspended" in body)) return null;
  return body.suspended === true;
}

/** The one write. `account` is a resolved document, so its `_id` is exact. */
export async function setAccountSuspension(collectionName, account, suspended) {
  await mongoose.connection
    .collection(collectionName)
    .updateOne({ _id: account._id }, { $set: { suspended: suspended === true } });

  return suspended === true;
}

/* ──────────────────────── The lock, on every request ──────────────────────── */

/**
 * What a suspended account is told, wherever it asks.
 *
 * It names who lifted the drawbridge, because that is who can lower it again,
 * and it says what has become of their work, because an account that has gone
 * quiet reads as one that has been deleted.
 */
const ACCOUNT_SUSPENDED_REASON =
  "Your account has been suspended by the administrator, so nothing here is open to you. " +
  "Nothing you have done has been deleted — contact your administrator to have it lifted.";

const ROLE_COLLECTIONS = {
  student: "Student",
  assessor: "Assessor",
  admin: "Admin"
};

/**
 * Whether an account is locked out, read off the row itself.
 *
 * Separated from the lookup so the rule can be exercised without a database,
 * the arrangement `classSuspensionFrom` uses for the course-level one.
 *
 * Only `true` locks. A row written before this field existed has nothing to
 * say here and is in good standing; so is one that somehow holds a string. The
 * flag is the one thing standing between a person and their own coursework, so
 * it is read exactly and never for truthiness.
 */
export function accountSuspensionFrom(account) {
  if (account?.suspended !== true) return null;

  return { suspended: true, scope: "account", by: "admin", reason: ACCOUNT_SUSPENDED_REASON };
}

/**
 * The same question asked of a live session, which is where a request asks it.
 *
 * One indexed read by `_id` per request. It is on the hot path for every
 * guarded route in the API, which is the price of the flag meaning something
 * the moment it is written rather than at the next sign-in.
 *
 * Two deliberate ways of answering "not suspended":
 *
 * A role with no collection behind it cannot be looked up, and a database that
 * is not connected cannot be asked. Both let the request through rather than
 * refusing it — this is a lock on one account, not a second health check, and
 * the handlers behind it already answer 503 for themselves. Refusing here
 * would turn a dropped database into "your account has been suspended", which
 * is a false and alarming thing to tell somebody.
 */
export async function loadAccountSuspension(session) {
  const collectionName = ROLE_COLLECTIONS[session?.role];
  if (!collectionName || !session?.id) return null;
  if (mongoose.connection.readyState !== 1) return null;

  const account = await mongoose.connection
    .collection(collectionName)
    .findOne({ _id: { $in: idCandidates(session.id) } }, { projection: { suspended: 1 } });

  return accountSuspensionFrom(account);
}

/**
 * The refusal: 423, the status this API already answers for "locked, and here
 * is why" (see courseAccess.js), so the client's existing handling of a locked
 * course covers this too.
 *
 * Not 401, which the client reads as a dead token: it would drop the session
 * and bounce to the login screen, and the student would be looking at a form
 * rather than at the reason. Not 403 either — everywhere else in this API that
 * means the thing asked for belongs to somebody else.
 *
 * `scope` is what tells this apart from a course being closed. Both are
 * suspensions, both arrive as a 423 carrying a sentence, and the client shows
 * them in different places: a closed course shuts a page, a closed account
 * shuts the console.
 */
export function refuseSuspendedAccount(response, suspension) {
  return response.status(423).json({
    message: suspension.reason,
    locked: true,
    suspended: true,
    scope: suspension.scope,
    by: suspension.by
  });
}
