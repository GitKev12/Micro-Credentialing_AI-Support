import mongoose from "mongoose";
import { findAssessor } from "./assessors.controller.js";

/**
 * Ties an assessor route to the assessor who signed in.
 *
 * Every route under /api/assessors names its assessor in the path, and until
 * now nothing checked that the name matched the caller. `requireRole` asked
 * what role you were, never who you were — so any signed-in assessor could read
 * a colleague's classes, their students' names and ID numbers, and their
 * pending credentials, and could post papers into their courses, by putting the
 * colleague's id in the URL. Verified against the running server before this
 * existed: every one of those answered 200.
 *
 * What made it awkward to close, and why this is a lookup rather than a string
 * comparison: `:assessorId` accepts either the Mongo id or the ASS### number,
 * because the client sends whichever the session happens to carry. The session
 * only ever holds the Mongo id, so comparing the two directly would have
 * refused every call that used the number — which is why the check was left out
 * in the first place. Resolving the parameter to a document first makes both
 * forms answer the same question.
 *
 * The lookup is not extra work. Every handler on these routes began by loading
 * the same assessor; they now read `request.assessor` instead, so the document
 * is fetched once per request rather than once per handler.
 */

/**
 * Whether this session may act as this assessor.
 *
 * Separated from the lookup so the rule can be exercised without a database —
 * it is the whole of the access decision, and the part worth being sure of.
 *
 * An admin may act as anyone: these routes are staff routes, and the admin
 * console's own screens report on assessors' work. Everybody else may act only
 * as themselves.
 */
export function mayActAs(session, assessor) {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (!assessor) return false;
  return String(assessor._id) === String(session.id);
}

/**
 * Resolves `:assessorId` and refuses anyone it does not belong to.
 *
 * A caller who is not an admin is answered 403 whether the id was somebody
 * else's or nobody's, so the route cannot be used to find out which assessor
 * ids exist.
 */
export async function requireOwnAssessor(request, response, next) {
  // This guard reads before any handler does, so the "database is down" answer
  // has to be made here too — otherwise a disconnected server buffers the
  // lookup until mongoose gives up and the caller gets a 500 where every other
  // route on the app says 503.
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({
      message: "The database is not connected. Set MONGODB_URI and restart the API."
    });
  }

  const assessor = await findAssessor(request.params.assessorId);

  if (!mayActAs(request.session, assessor)) {
    return response.status(403).json({ message: "You do not have access to this resource." });
  }

  if (!assessor) {
    return response.status(404).json({ message: "Assessor not found." });
  }

  request.assessor = assessor;
  return next();
}
