import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";

/**
 * Keeps Assessor.assigned_students in step with student enrolment.
 *
 * An assessor's students are not a list anyone maintains by hand: they are
 * everyone enrolled in a course that assessor is assigned to. Enrolling a
 * student, or assigning a course, changes that set — and until now nothing
 * updated it, so every assessor's list sat empty while the admin console read
 * its length as their student count.
 *
 * The set is recomputed from enrolment rather than added to and removed from.
 * Patching would get the overlaps wrong: an assessor teaching two courses a
 * student is in must keep that student when they leave only one of them, and
 * an incremental $pull cannot see the difference. Recomputing also repairs
 * whatever the field held before, so a wrong value never persists.
 */

const ASSESSORS_COLLECTION = "Assessor";
const STUDENTS_COLLECTION = "Student";

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);

/** Students enrolled in any of `courseIds`. */
function studentsForCourses(students, courseIds) {
  const wanted = new Set(courseIds.map(asId));
  return students.filter((student) =>
    (student.enrolledCourses ?? []).some((courseId) => wanted.has(asId(courseId)))
  );
}

/**
 * Rewrites assigned_students for each assessor given. Returns how many
 * documents actually changed, so a caller can report a no-op honestly.
 */
async function recompute(assessors) {
  if (assessors.length === 0) return { checked: 0, changed: 0 };

  const students = await collection(STUDENTS_COLLECTION).find({}).toArray();
  let changed = 0;

  for (const assessor of assessors) {
    const matching = studentsForCourses(students, assessor.assigned_courses ?? []);
    // Store ids in whatever form the documents already use, matching how
    // enrolledCourses stores course._id verbatim.
    const ids = matching.map((student) => student._id);

    const before = (assessor.assigned_students ?? []).map(asId).sort().join(",");
    const after = ids.map(asId).sort().join(",");
    if (before === after) continue;

    await collection(ASSESSORS_COLLECTION).updateOne(
      { _id: assessor._id },
      { $set: { assigned_students: ids } }
    );
    changed += 1;
  }

  return { checked: assessors.length, changed };
}

/**
 * Called after a student's enrolment in `courseId` changes — every assessor
 * teaching that course has a different roster now.
 */
export async function syncAssessorsForCourse(courseId) {
  const assessors = await collection(ASSESSORS_COLLECTION)
    .find({ assigned_courses: { $in: idCandidates(courseId) } })
    .toArray();
  return recompute(assessors);
}

/** Called after an assessor's course list changes. */
export async function syncAssessor(assessorId) {
  const assessor = await collection(ASSESSORS_COLLECTION).findOne({
    _id: { $in: idCandidates(assessorId) }
  });
  return assessor ? recompute([assessor]) : { checked: 0, changed: 0 };
}

/** Rebuilds every assessor's roster — used to repair existing data. */
export async function syncAllAssessors() {
  return recompute(await collection(ASSESSORS_COLLECTION).find({}).toArray());
}
