import mongoose from "mongoose";
import { collectionExists, idCandidates } from "./mongo.js";
import { findCourse } from "./courseAccess.js";
import { sortLessons } from "./lessonOrder.js";
import { passedLessonQuizzes } from "../badges/badges.service.js";

/**
 * Which lessons a student may open: one at a time, in order.
 *
 * A lesson opens when it is the first one, when the student already finished
 * it (kept open), or when they passed the exam of the lesson before it. A
 * lesson whose exam the assessor hasn't posted yet keeps the next one shut too.
 */

const MODULES_COLLECTION = "LearningModule";
const PROGRESS_COLLECTION = "ModuleProgress";

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);

/**
 * The lock on each lesson, from lessons already in course order.
 * Returns Map<moduleId, reason or null>.
 */
export function locksFrom(orderedModules, completedIds, passedIds) {
  const locks = new Map();
  orderedModules.forEach((module, index) => {
    const id = asId(module._id ?? module.id);
    const previous = orderedModules[index - 1];
    const open =
      index === 0 ||
      completedIds.has(id) ||
      passedIds.has(asId(previous._id ?? previous.id));

    locks.set(
      id,
      open ? null : `Pass the exam for "${previous.title ?? "the previous lesson"}" to open this lesson.`
    );
  });
  return locks;
}

/** The same, loaded for one student and one course (id, code, or course document). */
export async function loadLessonLocks(studentId, courseRef, modules = null) {
  if (!studentId || !courseRef) return new Map();

  let lessons = modules;
  if (!lessons) {
    if (!(await collectionExists(MODULES_COLLECTION))) return new Map();
    const course = typeof courseRef === "object" ? courseRef : await findCourse(courseRef);
    const code = String(course?.courseCode ?? course?.code ?? courseRef ?? "").trim();
    lessons = await collection(MODULES_COLLECTION)
      .find({
        $or: [
          { courseId: { $in: idCandidates(course?._id ?? courseRef) } },
          ...(code ? [{ courseCode: code }] : [])
        ]
      })
      .toArray();
  }
  const ordered = sortLessons([...lessons]);

  const completed = (await collectionExists(PROGRESS_COLLECTION))
    ? await collection(PROGRESS_COLLECTION)
        .find({ studentId: { $in: idCandidates(studentId) } })
        .project({ moduleId: 1 })
        .toArray()
    : [];
  const completedIds = new Set(completed.map((entry) => asId(entry.moduleId)));
  const passedIds = new Set((await passedLessonQuizzes(studentId, null)).keys());

  return locksFrom(ordered, completedIds, passedIds);
}

/** Why this student can't open this lesson, or null when they can. */
export async function lessonLockFor(studentId, module) {
  const locks = await loadLessonLocks(studentId, module.courseId ?? module.courseCode);
  return locks.get(asId(module._id)) ?? null;
}
