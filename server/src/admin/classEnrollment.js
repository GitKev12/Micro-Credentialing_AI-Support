import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";
import { courseStatus, hasCourseEnded } from "../lib/courseAccess.js";
import { publishStanding } from "../lib/standingEvents.js";
import { syncAssessorsForCourse } from "./enrollment.sync.js";
import { studentsHeldElsewhere } from "./class.rules.js";

/**
 * Discover — a student joining a class from the Student End.
 *
 * The admin posts a class to Discover and picks how students get in:
 * "open" (they join at once) or "approval" (they ask, the admin accepts).
 * Joining here writes the same things Classes Management writes when it adds
 * a student, so exams, grading and assessor lists all keep working.
 *
 *   Class { …, posted, enrollment: "open" | "approval", requestedStudentIds[] }
 *
 * Missing fields read as "not posted" and "needs approval", so older classes
 * need no migration.
 */

const CLASSES = "Class";
const STUDENTS = "Student";

const collection = (name) => mongoose.connection.collection(name);

export const ENROLLMENT_MODES = ["open", "approval"];

/** How students get into a posted class. Missing means they have to ask. */
export function enrollmentOf(cls) {
  return cls?.enrollment === "open" ? "open" : "approval";
}

/** Why this class can't take students right now, or null when it can. */
export function discoverRefusal(cls, course, at = new Date()) {
  if (!course || courseStatus(course) !== "active") return "This course isn't active.";
  if (hasCourseEnded(course, at)) return "This course has ended.";
  if (cls?.archived === true || cls?.active === false) return "This class is switched off.";
  if ((cls?.assessorIds ?? []).length !== 1) return "This class needs an assessor first.";
  return null;
}

/** Whether students can see and join this class on Discover. */
export function isOpenOnDiscover(cls, course, at = new Date()) {
  return cls?.posted === true && !discoverRefusal(cls, course, at);
}

/** Add the course to each person's course list. */
export async function linkToCourse(collectionName, field, personIds, courseId) {
  if (personIds.length === 0) return;
  await collection(collectionName).updateMany(
    { _id: { $in: personIds.flatMap((id) => idCandidates(id)) } },
    { $addToSet: { [field]: courseId } }
  );
}

/** Take these students' pending requests off every class on the course. */
export async function dropRequests(courseId, studentIds) {
  if (!studentIds || studentIds.length === 0) return;
  await collection(CLASSES).updateMany(
    { courseId: { $in: idCandidates(courseId) } },
    { $pull: { requestedStudentIds: { $in: studentIds.flatMap((id) => idCandidates(id)) } } }
  );
}

// Classes on the course that hold this student as a member (or, with
// `requests`, as a member or a pending request).
function holdingCount(courseId, keys, { requests = false } = {}) {
  const member = { studentIds: { $in: keys } };
  const filter = { courseId: { $in: idCandidates(courseId) } };
  if (requests) filter.$or = [member, { requestedStudentIds: { $in: keys } }];
  else Object.assign(filter, member);
  return collection(CLASSES).countDocuments(filter);
}

/**
 * Puts one student into a posted class. Returns null when done, or the reason
 * it was refused.
 *
 * `fromRequest` is the admin accepting a request, so the request has to still
 * be there. A student may be in only one class per course (class.rules.js).
 */
export async function addStudentToClass(cls, student, { fromRequest = false } = {}) {
  const keys = idCandidates(student._id);

  // Checked first only for a clear message; the write below is what guards it.
  const onCourse = await collection(CLASSES)
    .find({ courseId: { $in: idCandidates(cls.courseId) } })
    .toArray();
  const clash = studentsHeldElsewhere(onCourse, [student._id], cls._id)[0];
  if (clash) return `Already in ${clash.className} for this course.`;

  const filter = {
    _id: cls._id,
    posted: true,
    active: { $ne: false },
    archived: { $ne: true },
    studentIds: { $nin: keys }
  };
  if (fromRequest) filter.requestedStudentIds = { $in: keys };

  const result = await collection(CLASSES).updateOne(filter, {
    $addToSet: { studentIds: student._id },
    $pull: { requestedStudentIds: { $in: keys } },
    $set: { updatedAt: new Date() }
  });
  if (result.modifiedCount === 0) return "This class isn't open for enrollment.";

  // Two sections joined at the same moment: undo this one to keep the rule.
  if ((await holdingCount(cls.courseId, keys)) > 1) {
    await collection(CLASSES).updateOne({ _id: cls._id }, { $pull: { studentIds: { $in: keys } } });
    return "Already in another class for this course.";
  }

  // The same write-through Classes Management does when it adds a student.
  await linkToCourse(STUDENTS, "enrolledCourses", [student._id], cls.courseId);
  await dropRequests(cls.courseId, [student._id]);
  await syncAssessorsForCourse(cls.courseId);
  publishStanding(student._id);
  return null;
}

/** Adds a pending request for one student. Returns null, or the refusal. */
export async function addRequest(cls, student) {
  const keys = idCandidates(student._id);

  const result = await collection(CLASSES).updateOne(
    {
      _id: cls._id,
      posted: true,
      active: { $ne: false },
      archived: { $ne: true },
      studentIds: { $nin: keys },
      requestedStudentIds: { $nin: keys }
    },
    { $addToSet: { requestedStudentIds: student._id } }
  );
  if (result.modifiedCount === 0) return "This class isn't open for enrollment.";

  // One place or one request per course at a time.
  if ((await holdingCount(cls.courseId, keys, { requests: true })) > 1) {
    await collection(CLASSES).updateOne(
      { _id: cls._id },
      { $pull: { requestedStudentIds: { $in: keys } } }
    );
    return "You already have a place or a request on this course.";
  }
  return null;
}

/** Removes one student's pending request from a class. */
export async function removeRequest(cls, studentId) {
  await collection(CLASSES).updateOne(
    { _id: cls._id },
    { $pull: { requestedStudentIds: { $in: idCandidates(studentId) } } }
  );
}
