import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";

/**
 * Papers somebody has open.
 *
 * A StudentResult exists from the moment a paper is handed in and never
 * before, so until now the system could tell who had finished and who had not
 * — and nothing at all about the difference between a student who has never
 * looked at a quiz and one who is halfway through it. That difference is the
 * whole of what an assessor wants to know on the morning a paper is due.
 *
 * One document per student per paper, written when they open it and deleted
 * when they hand it in, so a row existing *is* the answer: this student has
 * this paper open and has not submitted it. Nothing here is derived and
 * nothing has to be reconciled against StudentResult.
 *
 * Opening is not the same as looking. A marked paper reopens as a review — the
 * student is reading what they scored, not working — and that is the same
 * request as starting a retake, which the client tells apart with `?retake=1`.
 * `getAssessmentForStudent` decides; this module only records.
 *
 * A row can outlive its usefulness: a student who opens a quiz and closes the
 * tab leaves one behind, and it stays until they submit. That is the honest
 * reading of "has it open" from a server that is never told about the tab
 * closing, and it errs the right way — an assessor chasing somebody who has
 * quietly given up is better than one who never knew they started.
 */

const ATTEMPTS_COLLECTION = "AssessmentAttempt";

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => (value == null ? "" : String(value));

/**
 * Record that this student has this paper open.
 *
 * Upserted rather than inserted, so opening the same paper twice is one row
 * with a later `openedAt` and not two.
 */
export async function openAttempt({ studentId, assessment }) {
  if (!studentId || !assessment?._id) return;

  await collection(ATTEMPTS_COLLECTION).updateOne(
    {
      studentId: { $in: idCandidates(studentId) },
      assessmentId: { $in: idCandidates(assessment._id) }
    },
    {
      $set: { openedAt: new Date() },
      // The filter matches on either id form, so Mongo cannot lift the values
      // out of it for a new document — they are named here instead.
      $setOnInsert: {
        studentId,
        assessmentId: assessment._id,
        courseId: assessment.courseId ?? null,
        moduleId: assessment.moduleId ?? null
      }
    },
    { upsert: true }
  );
}

/**
 * The paper is in. Whatever was open for it is not open any more.
 *
 * deleteMany rather than deleteOne: a row written before this collection had
 * its index, or under the other id form, would otherwise be left behind to
 * report the student as still working on a paper they have handed in.
 */
export async function closeAttempt({ studentId, assessmentId }) {
  if (!studentId || !assessmentId) return;

  await collection(ATTEMPTS_COLLECTION).deleteMany({
    studentId: { $in: idCandidates(studentId) },
    assessmentId: { $in: idCandidates(assessmentId) }
  });
}

/**
 * Who has each of these papers open, as assessmentId → set of student ids.
 *
 * A set rather than a count: the assessor's screen counts students, and the
 * same student can be in both this and the submitted list for a paper they
 * have handed in once and reopened for another go.
 */
export async function openAttemptsByAssessment(assessmentIds) {
  const byAssessment = new Map();
  const ids = Array.isArray(assessmentIds) ? assessmentIds : [];
  if (ids.length === 0 || !(await collectionExists(ATTEMPTS_COLLECTION))) return byAssessment;

  const rows = await collection(ATTEMPTS_COLLECTION)
    .find(
      { assessmentId: { $in: ids.flatMap((id) => idCandidates(id)) } },
      { projection: { assessmentId: 1, studentId: 1 } }
    )
    .toArray();

  rows.forEach((row) => {
    const key = asId(row.assessmentId);
    if (!byAssessment.has(key)) byAssessment.set(key, new Set());
    byAssessment.get(key).add(asId(row.studentId));
  });

  return byAssessment;
}

/**
 * How a posted paper stands across a course, in the four numbers the generate
 * screen shows: everyone enrolled, and how they divide.
 *
 * `submitted` wins over `open`, because a student retaking a paper they have
 * already handed in has submitted it — the retake is the second thing about
 * them, not the first. So the three states are exclusive and add up to `all`,
 * which is what lets them be read as one bar.
 */
export function takerCounts({ students = 0, submitted = null, open = null } = {}) {
  const handedIn = submitted instanceof Set ? submitted : new Set();
  const working = open instanceof Set ? open : new Set();

  const inProgress = [...working].filter((id) => !handedIn.has(id)).length;
  const all = Math.max(0, students);
  // Never below zero: a student can hand a paper in and later be dropped from
  // the course, which leaves more submissions on record than there are people.
  const notStarted = Math.max(0, all - handedIn.size - inProgress);

  return { all, notStarted, inProgress, submitted: handedIn.size };
}
