import mongoose from "mongoose";

/**
 * Suspending an *account* — the admin console's lock, on students and assessors
 * alike.
 *
 * It is a real lock and not a label: `loginUser` refuses a suspended account
 * (see auth/auth.controller.js), so this stops the person signing in at all.
 * Nothing is deleted, no enrolment moves, nothing they have earned is touched,
 * and clearing it restores them exactly as they were.
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
