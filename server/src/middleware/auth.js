import { readBearerToken, readRequestToken, verifyAuthToken } from "../auth/tokens.js";
import { loadAccountSuspension, refuseSuspendedAccount } from "../lib/suspension.js";

/**
 * Route guards.
 *
 * Until now the API had none: `ProtectedRoute` on the client hid screens, but
 * every `/api` route answered anyone who called it directly. These middlewares
 * are the server-side half of that, and they are the half that actually counts.
 *
 * `requireAuth` establishes *who* is calling; the role guards decide whether
 * that caller may proceed. Order matters — mount `requireAuth` first.
 */

function deny(response, status, message) {
  return response.status(status).json({ message });
}

/**
 * Who is calling, and whether they are still allowed to.
 *
 * The token says who, and says it without asking anybody: that is what a
 * signed token is for, and it is why a token stays good for the twelve hours
 * it was minted for however the account behind it has changed since. So the
 * account's own standing is read here, on the way in, once per request.
 *
 * It is the only place that can hold. Every route in this API is reached
 * through one of these two guards, and hanging the check off any one screen or
 * controller would leave the others open — a suspended student who can still
 * GET a lesson and POST a finished paper is not suspended.
 *
 * The read is an indexed lookup by `_id` with one field projected, and it is
 * skipped entirely while the database is down (see `loadAccountSuspension`),
 * so the routes that answer without one still do.
 */
async function establish(request, response, next, token) {
  const session = verifyAuthToken(token);

  if (!session) {
    return deny(response, 401, "Sign in to continue.");
  }

  const suspension = await loadAccountSuspension(session);
  if (suspension) {
    return refuseSuspendedAccount(response, suspension);
  }

  request.session = session;
  return next();
}

/** Verifies the bearer token and hangs the session off the request. */
export function requireAuth(request, response, next) {
  return establish(request, response, next, readBearerToken(request));
}

/**
 * As `requireAuth`, but also accepts `?token=` — for the routes the browser
 * fetches on its own, where no header can be attached. See `readRequestToken`.
 */
export function requireDownloadAuth(request, response, next) {
  return establish(request, response, next, readRequestToken(request));
}

/** Restricts a route to the listed roles. */
export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.session) {
      return deny(response, 401, "Sign in to continue.");
    }

    if (!roles.includes(request.session.role)) {
      return deny(response, 403, "You do not have access to this resource.");
    }

    return next();
  };
}

/*
 * A student's own record used to be guarded here too, by a
 * `requireSelfOrRole(parameter, ...roles)` that let a student through for their
 * own id and anyone on the role list through for everybody's. It is gone rather
 * than fixed: naming a role was the whole of its rule, and "assessor" on that
 * list meant every assessor could read and write every student's record.
 *
 * A guard that answers on a role alone cannot express whose students they are,
 * so the question is asked somewhere it can be — see middleware/student.guard.js
 * and its `requireOwnStudent`. Left out of this file so it cannot be picked up
 * again by a route that only wanted "students and staff".
 */
