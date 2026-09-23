import mongoose from "mongoose";
import { collectionExists, idCandidates } from "./mongo.js";
import { ASSESS_ONLY, classMode } from "./classMode.js";
import { toDate, toIsoDay } from "./courseDates.js";

/**
 * What a student may still do in a course — the two things that can close one.
 *
 * A course closes by its own calendar (the run is over), and a *student's*
 * place in it closes either when every class holding them there has been
 * switched off in the admin console, or when their assessor has stood that one
 * student down from the course. The calendar shuts a different amount from the
 * other two: an ended run stays readable, a closed place does not.
 *
 * None of these is the admin console's account suspension, which stops a person
 * signing in at all and is nothing to do with any one course — see
 * lib/suspension.js. These three decide what somebody who *has* signed in may
 * still do here.
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
 * The word for the other way a course closes for one person: their assessor has
 * stood them down from it.
 *
 * It says what is *not* affected as well as what is, because the two
 * suspensions in this system are easy to confuse. The admin's is on the
 * account and stops the person signing in at all (lib/suspension.js). This one
 * is on their place in one course: they still sign in, still see their other
 * courses, and still hold everything they have earned here.
 */
const STUDENT_SUSPENDED_REASON =
  "Your assessor has closed this course for you, so its lessons are shut for now. " +
  "Your account and your other courses are not affected.";

/**
 * Whether a class holding this student has stood them down on this course.
 *
 * `Class.suspendedStudentIds` is a subset of its `studentIds`: the students in
 * the class whose access the assessor has closed. They stay enrolled and stay
 * on the roster — this shuts the material, it does not undo the enrolment.
 */
function standsDown(classes, studentId) {
  if (!studentId) return false;
  const key = String(studentId);

  return (Array.isArray(classes) ? classes : []).some((cls) =>
    (cls?.suspendedStudentIds ?? []).some((id) => String(id) === key)
  );
}

/**
 * Why this student's place in a course is closed, or null while it is open.
 *
 * Takes the class documents rather than reading them, so the rule can be
 * tested without a database. Two things can close it, and they are told apart
 * because they are fixed by different people: the admin switches a class back
 * on, the assessor lets one student back in.
 *
 * The student's own standing is read first. Both can be true at once, and of
 * the two it is the one still true after the class comes back on — answering
 * with the class would send them to the wrong person and then close on them
 * again the moment that was fixed.
 *
 * Two things it deliberately does not do. It does not close a course for a
 * student who has no class at all: enrolment is written through from a class
 * today, but a row seeded before that was, or left behind by one, has no
 * switch to read and must not be shut by a rule it was never under. And it
 * does not close one where a *single* class is still active: two classes can
 * teach the same course, and switching one off must not shut the other's
 * students out — the same reasoning `inAnotherClass` uses when a class is
 * deleted.
 */
export function classSuspensionFrom(classes, studentId = null) {
  if (standsDown(classes, studentId)) {
    return { suspended: true, by: "assessor", reason: STUDENT_SUSPENDED_REASON };
  }

  if (!allSwitchedOff(classes)) return null;

  return { suspended: true, by: "class", reason: SUSPENDED_REASON };
}

/**
 * Whether a set of classes is switched off to the last one.
 *
 * The shared half of two questions: a student asks it of the classes holding
 * them, staff ask it of every class on the course. Both read an empty list as
 * open, because there is no switch to read, and both treat a class with no
 * `active` field as running — every class written before the switch existed
 * was.
 */
function allSwitchedOff(classes) {
  const list = Array.isArray(classes) ? classes : [];
  if (list.length === 0) return false;
  return !list.some((cls) => cls?.active !== false);
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

/**
 * The class this student sits this course in, as an id — or null when their
 * enrolment stands on its own, with no class behind it.
 *
 * One class per student per course is the rule the console is written to, so
 * the first is the answer. It is what decides which papers are theirs: a paper
 * is written for a class now, and the other section's is not theirs to sit.
 */
export async function classIdHolding(studentId, courseId) {
  const held = await classHolding(studentId, courseId);
  return held ? held.id : null;
}

/**
 * The same class, with the pathway it runs.
 *
 * Which paper a student takes and whether there are lessons in front of it are
 * one question asked twice, and the answer to both is on the class document —
 * so it is read once and carried, rather than fetched again from the caller
 * that needs the second half.
 */
export async function classHolding(studentId, courseId) {
  const [held] = await classesHolding(studentId, courseId);
  return held ? { id: String(held._id), mode: classMode(held) } : null;
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
    suspendedReason: suspension?.reason ?? null,
    // Which of the two closed it: "assessor" stood this one student down,
    // "class" is an administrator switching the whole class off. The reason
    // already reads differently; this is the same fact in a form a screen can
    // branch on without matching on a sentence.
    suspendedBy: suspension?.by ?? null
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

  for (const [courseId, classesOnCourse] of await classesHoldingByCourse(studentId)) {
    const suspension = classSuspensionFrom(classesOnCourse, studentId);
    if (suspension) byCourse.set(courseId, suspension);
  }

  return byCourse;
}

/**
 * Every class this student is in, grouped by course.
 *
 * One read behind two questions the course list asks together — whether this
 * student's place in a course is closed, and which pathway they are on. Asking
 * them separately meant the same query twice on every card.
 */
export async function classesHoldingByCourse(studentId) {
  const holding = new Map();
  if (!studentId) return holding;
  if (!(await collectionExists(CLASSES_COLLECTION))) return holding;

  const classes = await mongoose.connection
    .collection(CLASSES_COLLECTION)
    .find({ studentIds: { $in: idCandidates(studentId) } })
    .toArray();

  for (const cls of classes) {
    const key = String(cls.courseId);
    holding.set(key, [...(holding.get(key) ?? []), cls]);
  }

  return holding;
}

/**
 * Which pathway this student is on, per course.
 *
 * One class per student per course is the rule the console is written to, so
 * the first is the answer — the same reasoning `classIdHolding` uses.
 */
/**
 * Whether this course's lessons are off this caller's pathway entirely.
 *
 * An assess-only candidate is examined on what they already know. They take
 * one paper and no lesson quizzes, and the lessons are not theirs to read —
 * the course material is the taught section's, and handing it to someone
 * being examined on prior competence is handing them the answers to the
 * examination they are about to take.
 *
 * Not a closure, so it does not refuse the way an ended course or a switched
 * off class does: those shut something that was open, and say so. This was
 * never open, so a lesson answers the way a lesson that does not exist
 * answers — the same 404 a paper written for another class gives (see
 * classPapers.js). There is nothing here to tell them about.
 *
 * Staff are never hidden from: an assessor writes the examination out of these
 * lessons, and an admin uploaded them.
 */
export async function lessonsHiddenFrom(session, courseRef) {
  if (session?.role !== "student") return false;
  if (!session.id || !courseRef) return false;

  const course = await resolveCourse(courseRef);
  const held = await classHolding(session.id, course?._id ?? courseRef);

  return held?.mode === ASSESS_ONLY;
}

/** The same question for a student already named, where there is no session. */
export async function lessonsHiddenFromStudent(studentId, courseRef) {
  return lessonsHiddenFrom({ role: "student", id: studentId }, courseRef);
}

export async function loadStudentPathways(studentId) {
  const byCourse = new Map();

  for (const [courseId, classesOnCourse] of await classesHoldingByCourse(studentId)) {
    if (classesOnCourse[0]) byCourse.set(courseId, classMode(classesOnCourse[0]));
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
  return classSuspensionFrom(
    await classesHolding(studentId, course?._id ?? courseRef),
    studentId
  );
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
    await classesHolding(studentId, course?._id ?? courseRef),
    studentId
  );

  return suspension ?? courseRestriction(course, at);
}

/* ─────────────────────────── The staff side ─────────────────────────── */

/**
 * The staff wording for the same switch.
 *
 * A student is told their own class is closed. An assessor is told the course
 * has nobody left to give a paper to, which is the fact that decides whether
 * pressing generate is worth anything.
 */
const CLASSES_OFF_REASON =
  "Every class on this course is switched off, so no student can be given a paper. " +
  "Set one back to active to open it again.";

/**
 * Why staff may not write papers for this course, or null while it is open.
 *
 * The assessor console had no gate of its own: a paper could be generated,
 * corrected and posted into a course whose run was over or whose classes were
 * all switched off, and the only sign was the student being refused at the
 * other end, with nothing on the console to explain it.
 *
 * What closes is *authoring*, and only authoring. Marking a paper already
 * taken, releasing its grade and issuing the credential stay open however the
 * course stands — those are the record of work already done, and an ended
 * course still owes it. Unposting stays open for the same reason read the
 * other way round: taking a paper back off reduces what a student can reach,
 * so a closed course is no argument for refusing it.
 *
 * Takes the course and its classes rather than reading them, so the rule can
 * be exercised without a database — the arrangement `classSuspensionFrom` uses
 * for the student's half.
 */
export function authoringRestrictionFrom(course, classes, at = new Date()) {
  // The switch first, as on the student side: it is the stricter of the two,
  // and the only one an administrator can undo this afternoon.
  if (allSwitchedOff(classes)) {
    return { suspended: true, ended: false, endedOn: null, reason: CLASSES_OFF_REASON };
  }

  if (!hasCourseEnded(course, at)) return null;

  return {
    suspended: false,
    ended: true,
    endedOn: toIsoDay(course.endsOn),
    reason:
      `This course ended on ${formatCourseDay(course.endsOn)}. ` +
      "Its papers can no longer be written or posted."
  };
}

/**
 * Every class on a course, whoever is in it.
 *
 * The staff counterpart to `classesHolding`: an assessor is enrolled in
 * nothing, so the question is about the course rather than about them.
 */
async function classesOnCourses(courseIds) {
  const wanted = courseIds.filter(Boolean);
  if (wanted.length === 0) return [];
  if (!(await collectionExists(CLASSES_COLLECTION))) return [];

  return mongoose.connection
    .collection(CLASSES_COLLECTION)
    .find({ courseId: { $in: wanted.flatMap((id) => idCandidates(id)) } })
    .toArray();
}

/**
 * The classes on each of these courses, as `Map<courseId, Class[]>`.
 *
 * A course is taught through classes, and more than one class can teach the
 * same course. The assessor console works in courses — papers belong to a
 * course, and posting one reaches every class on it — but it should not
 * pretend the classes are not there: two of them showing as one row is how an
 * assessor loses track of which students they are looking at.
 */
export async function loadClassesByCourse(courses) {
  const byCourse = new Map(courses.map((course) => [String(course._id), []]));

  for (const cls of await classesOnCourses(courses.map((course) => course._id))) {
    const key = String(cls.courseId);
    if (byCourse.has(key)) byCourse.get(key).push(cls);
  }

  return byCourse;
}

/**
 * The classes on a course that this assessor teaches.
 *
 * A course can be taught by two assessors through a class each — Section A and
 * Section B of the same subject — and neither of them is teaching the other's
 * students. An assessor's own classes are the ones naming them.
 */
export function classesTaughtBy(classes, assessorId) {
  const wanted = String(assessorId ?? "");
  if (!wanted) return [];

  return (classes ?? []).filter((cls) =>
    (cls.assessorIds ?? []).some((id) => String(id) === wanted)
  );
}

/**
 * The students an assessor teaches on one course, as a set of ids — or null
 * when no class on the course is theirs.
 *
 * Null and the empty set are different answers, and the difference decides
 * whole screens. Null means there is nothing to narrow by: the course is
 * reached by enrolment alone, with no class rows standing between the assessor
 * and its roll, so the roll is the honest answer. An empty set means they teach
 * a class here and it holds nobody, and showing them the course's other
 * students would be showing them somebody else's class.
 */
export function studentsTaughtBy(classes, assessorId) {
  const mine = classesTaughtBy(classes, assessorId);
  if (mine.length === 0) return null;

  const ids = new Set();
  for (const cls of mine) {
    for (const studentId of cls.studentIds ?? []) ids.add(String(studentId));
  }

  return ids;
}

/** Whether this student is one of `taught` — where null means "everyone here". */
export const teaches = (taught, studentId) => taught == null || taught.has(String(studentId));

/** Whether one course is still open to writing and posting papers. */
export async function loadAuthoringRestriction(courseRef, at = new Date()) {
  const course = await resolveCourse(courseRef);
  const classes = await classesOnCourses([course?._id ?? courseRef]);

  return authoringRestrictionFrom(course, classes, at);
}

/**
 * The same verdict for a list of courses at once, as `Map<courseId, restriction>`.
 *
 * One query for the whole register rather than one per row — the assessor's
 * Classes screen asks this of every course it is about to draw. Only the
 * closed courses are in the map, so a missing key reads as open.
 */
export async function loadAuthoringRestrictions(courses, at = new Date()) {
  const closed = new Map();
  if (courses.length === 0) return closed;

  const classes = await classesOnCourses(courses.map((course) => course._id));

  const byCourse = new Map();
  for (const cls of classes) {
    const key = String(cls.courseId);
    byCourse.set(key, [...(byCourse.get(key) ?? []), cls]);
  }

  for (const course of courses) {
    const key = String(course._id);
    const restriction = authoringRestrictionFrom(course, byCourse.get(key) ?? [], at);
    if (restriction) closed.set(key, restriction);
  }

  return closed;
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
    endedOn: restriction.endedOn ?? null,
    // "course", against the account scope lib/suspension.js refuses with: this
    // one shuts a page, that one shuts the console. `by` is who to go to.
    scope: "course",
    by: restriction.by ?? null
  });
}
