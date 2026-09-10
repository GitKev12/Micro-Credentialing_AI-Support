import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";

/**
 * Ties a student route to the people entitled to that student's record.
 *
 * Every route under /api/students names its student in the path, and the guard
 * that stood here — `requireSelfOrRole("studentId", "assessor", "admin")` —
 * asked what role the caller was and never which students were theirs. Any
 * signed-in assessor could therefore read any student's courses, progress,
 * quiz results, skill gap, badges and certificates by putting their id in the
 * URL, and could write to the record too: the same guard sits on marking a
 * lesson complete and on handing a quiz in, so a paper could be submitted in
 * the name of a student on nobody's roster.
 *
 * It is the hole `requireOwnAssessor` closed on the /api/assessors routes (see
 * assessors.guard.js), still open on the other door into the same data. The
 * console was locked and this was not.
 *
 * What makes an id the wrong thing to have relied on: student ids are not
 * secrets. They travel in URLs, logs and exports, every admin screen holds
 * them, and an assessor is handed the ids of everyone on their own roster.
 * Nothing about knowing one says the student is yours.
 */

/**
 * The courses an assessor teaches.
 *
 * `assigned_courses` and nothing else, because `coursesForAssessor` — the only
 * other thing that answers this question — reads that one field. A spelling
 * accepted here and nowhere else would hand an assessor a student their own
 * console does not believe is theirs.
 */
export function assignedCourseIds(assessor) {
  const assigned = assessor?.assigned_courses ?? [];
  return Array.isArray(assigned) ? assigned : [];
}

/**
 * The courses a student is enrolled in.
 *
 * Three spellings, matching `loadEnrollment` in courses.controller.js. That is
 * the function deciding which courses these very routes will serve, so reading
 * enrolment more narrowly here would refuse an assessor a student whose record
 * the route behind it would have been happy to hand over.
 */
export function enrolledCourseIds(student) {
  const enrolled = student?.enrolledCourses ?? student?.enrolled_courses ?? student?.courses ?? [];
  return Array.isArray(enrolled) ? enrolled : [];
}

/**
 * Whether this student sits on any course this assessor teaches.
 *
 * Enrolment overlap, which is the same rule the console already applies: the
 * roster lists the students enrolled in a course the assessor is assigned to,
 * and `setRosterStudentSuspension` refuses to act on anyone else. Asking it the
 * same way here is what keeps the two from disagreeing — an assessor must never
 * be shown a student on one screen and refused their record on the next.
 *
 * Ids are compared as text: one side comes off a document as an ObjectId and
 * the other may be either, and comparing them raw would refuse every call.
 */
export function teachesStudent(assessor, student) {
  if (!assessor || !student) return false;

  const assigned = new Set(assignedCourseIds(assessor).map((id) => String(id)));
  if (assigned.size === 0) return false;

  return enrolledCourseIds(student).some((id) => assigned.has(String(id)));
}

/**
 * Who may act on a student's record.
 *
 * Separated from the lookup so the rule can be exercised without a database —
 * it is the whole of the access decision, and the part worth being sure of.
 *
 * A student may reach their own record and no other. An admin may reach
 * anyone's: the admin console's own screens report on every student there is.
 * An assessor may reach the students they teach, which is the clause that was
 * missing. `assessor` and `student` are the resolved documents; they are only
 * consulted for an assessor, because that is the only claim needing checking.
 *
 * Note this covers writing as well as reading. Staff amending a student's
 * progress is deliberate — see the route comments — and what changes here is
 * only *whose* progress.
 */
export function mayActOnStudent(session, studentId, { assessor, student } = {}) {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (session.role === "assessor") return teachesStudent(assessor, student);
  if (session.role === "student") return String(studentId) === String(session.id);
  return false;
}

/**
 * Resolves the student named by `parameter` and refuses anyone with no claim
 * on them.
 *
 * `parameter` names the route param holding the student id — it is `:id` on
 * some routes and `:studentId` on others, so the caller says which.
 *
 * A refusal is the same 403 whether the student is somebody else's or nobody
 * at all, so the routes cannot be walked to find out which student ids exist.
 */
export function requireOwnStudent(parameter) {
  return async (request, response, next) => {
    const session = request.session;

    if (!session) {
      return response.status(401).json({ message: "Sign in to continue." });
    }

    const studentId = request.params[parameter];
    const refuse = () =>
      response.status(403).json({ message: "You do not have access to this resource." });

    // Only an assessor's claim needs looking up: a student's own record is
    // theirs or nobody's, and an admin reaches every student regardless. This
    // is also what keeps the lookout endpoints graceful — a student still gets
    // their empty, `pending: true` answer when the database is down, because
    // nothing here has to ask it anything.
    if (session.role !== "assessor") {
      return mayActOnStudent(session, studentId) ? next() : refuse();
    }

    // The queries below would otherwise buffer until mongoose gave up, and the
    // caller would get a 500 where every other route on the app says 503.
    if (mongoose.connection.readyState !== 1) {
      return response.status(503).json({
        message: "The database is not connected. Set MONGODB_URI and restart the API."
      });
    }

    const collection = (name) => mongoose.connection.collection(name);

    const [assessor, student] = await Promise.all([
      // The session only ever carries the Mongo id, so there is one form to
      // look the caller up by.
      collection("Assessor").findOne(
        { _id: { $in: idCandidates(session.id) } },
        { projection: { assigned_courses: 1 } }
      ),
      // The path may carry the Mongo id or the student number, the same pair
      // the handlers behind this accept.
      collection("Student").findOne(
        { $or: [{ _id: { $in: idCandidates(studentId) } }, { student_id: studentId }] },
        { projection: { enrolledCourses: 1, enrolled_courses: 1, courses: 1 } }
      )
    ]);

    return mayActOnStudent(session, studentId, { assessor, student }) ? next() : refuse();
  };
}
