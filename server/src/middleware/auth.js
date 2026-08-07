import { readBearerToken, readRequestToken, verifyAuthToken } from "../auth/tokens.js";

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

/** Verifies the bearer token and hangs the session off the request. */
export function requireAuth(request, response, next) {
  const session = verifyAuthToken(readBearerToken(request));

  if (!session) {
    return deny(response, 401, "Sign in to continue.");
  }

  request.session = session;
  return next();
}

/**
 * As `requireAuth`, but also accepts `?token=` — for the routes the browser
 * fetches on its own, where no header can be attached. See `readRequestToken`.
 */
export function requireDownloadAuth(request, response, next) {
  const session = verifyAuthToken(readRequestToken(request));

  if (!session) {
    return deny(response, 401, "Sign in to continue.");
  }

  request.session = session;
  return next();
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

/**
 * Lets a student reach their own record, and staff reach anyone's.
 *
 * `parameter` names the route param holding the student id — it is `:id` on
 * some routes and `:studentId` on others, so the caller says which.
 */
export function requireSelfOrRole(parameter, ...roles) {
  return (request, response, next) => {
    if (!request.session) {
      return deny(response, 401, "Sign in to continue.");
    }

    if (roles.includes(request.session.role)) return next();

    if (String(request.params[parameter]) === String(request.session.id)) {
      return next();
    }

    return deny(response, 403, "You do not have access to this resource.");
  };
}
