import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { gradeSubmission, toAssessmentSummary, toStudentAssessment } from "./assessments.format.js";

/**
 * Taking a quiz: what is unlocked, what the questions are, and what a
 * submission scores.
 *
 * The gates are enforced here rather than in the rail. The client hides a
 * locked quiz, but hiding a button is not a rule — without this the lock is
 * one fetch away from being bypassed.
 *
 * Two gates, matching the course design:
 *   lesson quiz — opens once that lesson is marked complete.
 *   final       — opens once every lesson is complete *and* every lesson quiz
 *                 has been passed, since a passed quiz is what earns a badge.
 */

const ASSESSMENTS_COLLECTION = "Assessment";
const MODULES_COLLECTION = "LearningModule";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

function serviceUnavailable(response) {
  return response.status(503).json({
    message: "The database is not connected. Set MONGODB_URI and restart the API."
  });
}

function courseMatch(courseId) {
  return { $or: [{ courseId: { $in: idCandidates(courseId) } }, { courseCode: courseId }] };
}

/** The score that counts: a released review overrides the automatic mark. */
function effectiveScore(result) {
  if (result?.review?.status === "released" && result.review.finalScore != null) {
    return Number(result.review.finalScore);
  }
  return Number(result?.aiGrading?.score ?? 0);
}

function resultPassed(result, assessment) {
  if (!result) return false;
  return effectiveScore(result) >= Number(assessment?.passMark ?? Infinity);
}

/** Everything the gates need, read once. */
async function loadCourseState(studentId, courseId) {
  const [hasAssessments, hasModules, hasProgress, hasResults] = await Promise.all([
    collectionExists(ASSESSMENTS_COLLECTION),
    collectionExists(MODULES_COLLECTION),
    collectionExists(PROGRESS_COLLECTION),
    collectionExists(RESULTS_COLLECTION)
  ]);

  const assessments = hasAssessments
    ? await collection(ASSESSMENTS_COLLECTION).find(courseMatch(courseId)).toArray()
    : [];
  const modules = hasModules
    ? await collection(MODULES_COLLECTION).find(courseMatch(courseId)).toArray()
    : [];
  const progress = hasProgress
    ? await collection(PROGRESS_COLLECTION)
        .find({
          studentId: { $in: idCandidates(studentId) },
          courseId: { $in: idCandidates(courseId) }
        })
        .toArray()
    : [];
  const results = hasResults
    ? await collection(RESULTS_COLLECTION)
        .find({
          studentId: { $in: idCandidates(studentId) },
          courseId: { $in: idCandidates(courseId) }
        })
        .toArray()
    : [];

  return {
    assessments,
    modules,
    completedModuleIds: new Set(progress.map((entry) => asId(entry.moduleId))),
    resultByAssessment: new Map(results.map((result) => [asId(result.assessmentId), result]))
  };
}

/**
 * Whether one assessment is open, and why not when it isn't. The reason is
 * returned so the UI can say what to finish rather than only that it is shut.
 */
function lockStateFor(assessment, state) {
  const summary = toAssessmentSummary(assessment);

  if (summary.scope === "lesson") {
    const done = state.completedModuleIds.has(asId(summary.moduleId));
    return done
      ? { locked: false, reason: null }
      : { locked: true, reason: "Finish this lesson to unlock its quiz." };
  }

  const lessonsLeft = state.modules.filter(
    (module) => !state.completedModuleIds.has(asId(module._id))
  ).length;

  const lessonQuizzes = state.assessments.filter(
    (candidate) => toAssessmentSummary(candidate).scope === "lesson"
  );
  const quizzesLeft = lessonQuizzes.filter((quiz) => {
    const normalized = toAssessmentSummary(quiz);
    return !resultPassed(state.resultByAssessment.get(asId(quiz._id)), normalized);
  }).length;

  if (lessonsLeft === 0 && quizzesLeft === 0) return { locked: false, reason: null };

  const parts = [];
  if (lessonsLeft > 0) parts.push(`${lessonsLeft} lesson${lessonsLeft === 1 ? "" : "s"}`);
  if (quizzesLeft > 0) parts.push(`${quizzesLeft} quiz${quizzesLeft === 1 ? "" : "zes"}`);

  return { locked: true, reason: `Complete ${parts.join(" and ")} to unlock the final assessment.` };
}

function resultSummary(result, summary) {
  if (!result) return null;
  const score = effectiveScore(result);
  return {
    score,
    total: summary.totalPoints,
    passMark: summary.passMark,
    passed: score >= summary.passMark,
    submittedAt: result.submittedAt ?? null,
    reviewStatus: result.review?.status ?? "pending"
  };
}

/**
 * A row for a quiz that does not exist yet.
 *
 * The rail is built entirely from what this endpoint returns, so before any
 * quizzes are generated it had nothing to draw and a course looked as though it
 * had no assessments at all. A placeholder keeps the shape of the course
 * visible — the student can see a quiz is coming for each lesson, and where the
 * final sits — without pretending there is a paper to sit.
 *
 * It is always locked, and it carries no id that resolves to a document, so the
 * two endpoints that serve questions answer 404 if one is ever clicked through.
 * `placeholder: true` is what the rail keys off to skip the score line.
 */
function placeholderRow(courseId, { scope, moduleId = null }) {
  return {
    id: `placeholder:${scope}:${asId(moduleId ?? courseId)}`,
    courseId: courseId ?? null,
    moduleId: scope === "final" ? null : moduleId,
    scope,
    title: "",
    description: "",
    pointsPerItem: 0,
    itemsPerAttempt: 0,
    itemCount: 0,
    totalPoints: 0,
    passMark: 0,
    source: null,
    placeholder: true,
    locked: true,
    reason:
      scope === "final"
        ? "The final assessment has not been prepared yet."
        : "This quiz has not been prepared yet.",
    result: null
  };
}

/**
 * GET /api/students/:studentId/courses/:courseId/assessments
 *
 * The rail's source of truth: every quiz in the course, each with its lock
 * state and the student's own result. Lessons with no quiz yet, and a course
 * with no final yet, get a locked placeholder so the rail is never empty.
 */
export async function getCourseAssessmentsForStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { studentId, courseId } = request.params;
  const state = await loadCourseState(studentId, courseId);

  const assessments = state.assessments
    .map((doc) => {
      const summary = toAssessmentSummary(doc);
      if (!summary) return null;
      return {
        ...summary,
        ...lockStateFor(doc, state),
        result: resultSummary(state.resultByAssessment.get(asId(doc._id)), summary)
      };
    })
    .filter(Boolean);

  // Placeholders are added after the real rows, and never join `state`, so the
  // final's gate still counts only quizzes that actually exist. Were they
  // counted, an ungenerated course would report 68 quizzes left to pass.
  const coveredModuleIds = new Set(
    assessments
      .filter((row) => row.scope === "lesson")
      .map((row) => asId(row.moduleId))
  );

  state.modules.forEach((module) => {
    if (coveredModuleIds.has(asId(module._id))) return;
    assessments.push(placeholderRow(courseId, { scope: "lesson", moduleId: module._id }));
  });

  if (!assessments.some((row) => row.scope === "final")) {
    assessments.push(placeholderRow(courseId, { scope: "final" }));
  }

  // Lesson quizzes in lesson order, the final last — the rail renders them in
  // the order it receives.
  const moduleOrder = new Map(state.modules.map((module, index) => [asId(module._id), index]));
  assessments.sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === "final" ? 1 : -1;
    return (
      (moduleOrder.get(asId(left.moduleId)) ?? 0) - (moduleOrder.get(asId(right.moduleId)) ?? 0)
    );
  });

  return response.json({
    assessments,
    pending: state.assessments.length === 0
  });
}

async function findAssessment(assessmentId) {
  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) return null;
  return collection(ASSESSMENTS_COLLECTION).findOne({ _id: { $in: idCandidates(assessmentId) } });
}

/**
 * GET /api/students/:studentId/assessments/:assessmentId
 *
 * The questions, without the answer key. 423 while the gate is shut.
 */
export async function getAssessmentForStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { studentId, assessmentId } = request.params;
  const doc = await findAssessment(assessmentId);

  if (!doc) return response.status(404).json({ message: "Assessment not found." });

  const state = await loadCourseState(studentId, doc.courseId);
  const lock = lockStateFor(doc, state);

  if (lock.locked) {
    return response.status(423).json({ message: lock.reason, locked: true });
  }

  const summary = toAssessmentSummary(doc);

  return response.json({
    // studentId decides which questions of the bank this student is given, and
    // it has to be the same id grading uses — see selectItemsFor.
    assessment: toStudentAssessment(doc, { studentId }),
    result: resultSummary(state.resultByAssessment.get(asId(doc._id)), summary)
  });
}

/**
 * POST /api/students/:studentId/assessments/:assessmentId/submit
 * Body: { answers: [{ itemId, choice }] }
 *
 * Marked against the key here, then stored in the StudentResult shape the
 * assessor console already reads, so a submission lands in the grading queue
 * exactly as a generated one would.
 */
export async function submitAssessment(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { studentId, assessmentId } = request.params;
  const { answers } = request.body ?? {};

  if (!Array.isArray(answers)) {
    return response.status(400).json({ message: "answers must be an array." });
  }

  const doc = await findAssessment(assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found." });

  const state = await loadCourseState(studentId, doc.courseId);
  const lock = lockStateFor(doc, state);

  if (lock.locked) {
    return response.status(423).json({ message: lock.reason, locked: true });
  }

  // One attempt: a re-submission would silently overwrite a mark an assessor
  // may already have released.
  const existing = state.resultByAssessment.get(asId(doc._id));
  if (existing) {
    return response.status(409).json({
      message: "This assessment has already been submitted.",
      result: resultSummary(existing, toAssessmentSummary(doc))
    });
  }

  const graded = gradeSubmission(doc, answers, { studentId });

  const record = {
    assessmentId: doc._id,
    moduleId: doc.moduleId ?? null,
    courseId: doc.courseId ?? null,
    studentId: String(studentId),
    submittedAt: new Date(),
    // The questions this student was actually given. Without it the assessor
    // console would review the whole bank and mark the unasked ones wrong.
    servedItemIds: graded.servedItemIds,
    answers: answers.map((answer) => ({
      itemId: String(answer?.itemId ?? ""),
      choice: String(answer?.choice ?? "")
    })),
    aiGrading: {
      // Marked by exact comparison against the key, not by a model — the AI's
      // job is writing the questions, not scoring these two item types.
      status: "graded",
      source: "auto",
      score: graded.score,
      items: graded.items
    },
    review: {
      status: "pending",
      overrides: {},
      finalScore: null,
      remark: null,
      gradedBy: null,
      gradedAt: null
    },
    credential: { status: "none", name: null, issuedAt: null, issuedBy: null }
  };

  await collection(RESULTS_COLLECTION).insertOne(record);

  return response.status(201).json({
    result: {
      score: graded.score,
      total: graded.total,
      passMark: graded.passMark,
      passed: graded.passed,
      correct: graded.correct,
      itemCount: graded.items.length,
      submittedAt: record.submittedAt,
      reviewStatus: "pending"
    }
  });
}
