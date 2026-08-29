import mongoose from "mongoose";
import { collectionExists, idCandidates } from "./mongo.js";
import { toDate, toIsoDay } from "./courseDates.js";

/**
 * What a student may still do in a course — the two things that can close one.
 *
 * A course closes by its own calendar (the run is over), and a *student's*
 * place in it closes when every class holding them there has been switched off
 * in the admin console. The two shut different amounts: an ended run stays
 * readable, a switched-off class does not.
 *
 * The run dates are the admin's (see courseDates.js); this is what they mean
 * for the person enrolled. Once the end date has passed the course closes to
 * work but not to reading: the lessons stay open, a paper already sat stays
 * reviewable, and everything that would move the student forward — finishing a
 * lesson, writing a quiz, sitting or re-sitting one — is refused.
 *
 * Read-only rather than shut, because the two things a closed course still
 * owes a student are the material they were taught and the record of what they
 * scored. Taking those away would punish them for the calendar.
 *
 * The gate lives here rather than in the client because a hidden button is not
 * a rule — every endpoint that writes to a course's record checks it.
 */

const COURSES_COLLECTION = "Course";
const CLASSES_COLLECTION = "Class";

/** The UTC day a moment falls on, as a number two of them can be compared by. */
const dayOf = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * The end date is the last day of the run, not the first day after it — the
 * same reading that makes a course starting and ending on the 4th one day
 * long. So a course ends when the day is *past* its end date.
 *
 * Compared in UTC, because that is how the day was stored. A student east of
 * Greenwich therefore keeps the course a few hours into their own next day,
 * which is the forgiving side of the boundary to be on.
 */
export function hasCourseEnded(course, at = new Date()) {
  const endsOn = toDate(course?.endsOn);
  if (!endsOn) return false;
  return dayOf(at) > dayOf(endsOn);
}

/** "Oct 10, 2026" — the end date as a person writes it. */
export function formatCourseDay(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * The restriction on a course, or null while it is still running.
 *
 * One `reason` for every refusal and every banner, so the student is told the
 * same thing by the card, the reader and the quiz that turned them away.
 */
export function courseRestriction(course, at = new Date()) {
  if (!hasCourseEnded(course, at)) return null;

  return {
    ended: true,
    endedOn: toIsoDay(course.endsOn),
    reason:
      `This course ended on ${formatCourseDay(course.endsOn)}. ` +
      "You can still read it, but it can no longer be worked on."
  };
}

/**
 * The word a student is turned away with when their class is switched off.
 *
 * It names the class rather than the course, because the course itself is
 * untouched — a second class on the same course carries on — and it says the
 * state is reversible, because it is: the admin flips the switch back.
 */
const SUSPENDED_REASON =
  "Your class for this course is switched off, so its lessons are closed for now. " +
  "They open again when the administrator sets the class back to active.";

/**
 * Whether the classes holding a student in a course have all been switched off.
 *
 * Takes the class documents rather than reading them, so the rule can be
 * tested without a database.
 *
 * Two things it deliberately does not do. It does not close a course for a
 * student who has no class at all — enrolling straight from the Students
 * screen is still a way in, and there is no switch on that to read. And it does
 * not close one where a *single* class is still active: two classes can teach
 * the same course, and switching one off must not shut the other's students
 * out — the same reasoning `inAnotherClass` uses when a class is deleted.
 */
export function classSuspensionFrom(classes) {
  const holding = Array.isArray(classes) ? classes : [];
  if (holding.length === 0) return null;
  if (holding.some((cls) => cls?.active !== false)) return null;

  return { suspended: true, reason: SUSPENDED_REASON };
}

/** The classes a student is in on one course. */
async function classesHolding(studentId, courseId) {
  if (!studentId || !courseId) return [];
  if (!(await collectionExists(CLASSES_COLLECTION))) return [];

  return mongoose.connection
    .collection(CLASSES_COLLECTION)
    .find({
      courseId: { $in: idCandidates(courseId) },
      studentIds: { $in: idCandidates(studentId) }
    })
    .toArray();
}

/** The course fields every screen needs to say whether it is open. */
export function toCourseAccess(course, at = new Date(), suspension = null) {
  const restriction = courseRestriction(course, at);

  return {
    startsOn: toIsoDay(course?.startsOn),
    endsOn: toIsoDay(course?.endsOn),
    ended: Boolean(restriction),
    endedReason: restriction?.reason ?? null,
    // Not a property of the course — of this student's place in it. A course
    // suspended for one student is open to the class next door.
    suspended: Boolean(suspension),
    suspendedReason: suspension?.reason ?? null
  };
}

/**
 * The course a lesson or a quiz belongs to.
 *
 * Documents name their course by id or by course code — the same pair the
 * module and assessment lookups accept — so both are matched here.
 */
export async function findCourse(courseId) {
  if (!courseId) return null;
  if (!(await collectionExists(COURSES_COLLECTION))) return null;

  return mongoose.connection.collection(COURSES_COLLECTION).findOne({
    $or: [
      { _id: { $in: idCandidates(courseId) } },
      { courseCode: String(courseId) },
      { code: String(courseId) }
    ]
  });
}

/**
 * Every course a student's classes have closed, as `Map<courseId, suspension>`.
 *
 * One query for the whole dashboard rather than one per card — the courses
 * list asks this of every enrolment it is about to draw.
 */
export async function loadStudentSuspensions(studentId) {
  const byCourse = new Map();
  if (!studentId) return byCourse;
  if (!(await collectionExists(CLASSES_COLLECTION))) return byCourse;

  const classes = await mongoose.connection
    .collection(CLASSES_COLLECTION)
    .find({ studentIds: { $in: idCandidates(studentId) } })
    .toArray();

  const holding = new Map();
  for (const cls of classes) {
    const key = String(cls.courseId);
    holding.set(key, [...(holding.get(key) ?? []), cls]);
  }

  for (const [courseId, classesOnCourse] of holding) {
    const suspension = classSuspensionFrom(classesOnCourse);
    if (suspension) byCourse.set(courseId, suspension);
  }

  return byCourse;
}

/**
 * The course a reference names — already a document, or an id or code to look
 * one up by. Handlers that hold the document pass it rather than paying for a
 * second read of the row they are already holding.
 */
async function resolveCourse(courseRef) {
  if (courseRef && typeof courseRef === "object" && courseRef._id) return courseRef;
  return findCourse(courseRef);
}

/** Whether this student's classes on a course have all been switched off. */
export async function loadClassSuspension(studentId, courseRef) {
  const course = await resolveCourse(courseRef);
  return classSuspensionFrom(await classesHolding(studentId, course?._id ?? courseRef));
}

/**
 * The one restriction that applies to this student in this course, or null.
 *
 * A switched-off class is checked first because it is the stricter of the two:
 * an ended course is read-only, a switched-off class is shut, and answering
 * with the milder reason would leave the lessons open.
 *
 * `courseRef` may be a course document, an id, or a course code — lessons carry
 * either of the last two, so the gate must not turn on how one happens to be
 * linked.
 */
export async function loadStudentRestriction(studentId, courseRef, at = new Date()) {
  const course = await resolveCourse(courseRef);
  const suspension = classSuspensionFrom(
    await classesHolding(studentId, course?._id ?? courseRef)
  );

  return suspension ?? courseRestriction(course, at);
}

/**
 * The refusal itself: 423, the same status the lesson and final gates answer
 * with, so the client's existing "locked" handling covers this too. `ended`
 * and `suspended` ride along for the one thing that differs — neither has
 * anything the student can finish to open it again.
 */
export function refuseRestrictedCourse(response, restriction) {
  return response.status(423).json({
    message: restriction.reason,
    locked: true,
    ended: Boolean(restriction.ended),
    suspended: Boolean(restriction.suspended),
    endedOn: restriction.endedOn ?? null
  });
}
