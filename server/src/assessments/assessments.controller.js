import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { gradeSubmission, toAssessmentSummary, toStudentAssessment } from "./assessments.format.js";
import { ensureFinalAssessment, ensureLessonAssessment } from "./assessments.autogen.js";
import { lessonBadgeFor } from "../badges/badges.service.js";

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
 *
 * There is no schedule anywhere in this: a quiz opens for one student the
 * moment that student finishes reading, and stays shut for everyone else.
 *
 * Unlocking and writing are separate on purpose. Finishing a lesson opens the
 * quiz but writes nothing; the questions are produced when the student presses
 * "Take the Quiz" — see `prepareLessonAssessment`. A lesson that is read and
 * then set aside therefore costs nothing at all.
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
/**
 * How many times a paper may be sat.
 *
 * A lesson quiz is practice: a student who failed it should be able to read the
 * lesson again and come back, as often as it takes, and no credential rests on
 * it. The final is the examination that issues the credential, so it is capped.
 *
 * Retaking costs nothing to generate. The bank was written once and every
 * sitting is drawn from it — see selectItemsFor — so an unlimited quiz is
 * unlimited only in a student's time, never in tokens.
 */
export const FINAL_ATTEMPT_LIMIT = 3;

export const attemptLimitFor = (scope) => (scope === "final" ? FINAL_ATTEMPT_LIMIT : Infinity);

/**
 * The attempt that counts.
 *
 * Latest wins, so a retake supersedes what came before it. Results written
 * before retakes existed carry no `attempt`, and are treated as attempt 1 —
 * which is what they were.
 */
const attemptNo = (result) => Number(result?.attempt ?? 1);

export const currentAttempt = (results) =>
  results.reduce((latest, result) => (!latest || attemptNo(result) >= attemptNo(latest) ? result : latest), null);

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

  // Every attempt is kept, so this can no longer be a straight Map of the rows
  // — two attempts at one paper would collapse into whichever loaded last.
  const attemptsByAssessment = new Map();
  for (const result of results) {
    const key = asId(result.assessmentId);
    if (!attemptsByAssessment.has(key)) attemptsByAssessment.set(key, []);
    attemptsByAssessment.get(key).push(result);
  }

  return {
    assessments,
    modules,
    completedModuleIds: new Set(progress.map((entry) => asId(entry.moduleId))),
    attemptsByAssessment,
    resultByAssessment: new Map(
      [...attemptsByAssessment].map(([key, rows]) => [key, currentAttempt(rows)])
    )
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

/**
 * Which questions were right and which were missed, for a paper already sat.
 *
 * Verdicts only — never the key, and never the correct choice. Knowing that
 * question three was missed is the student's own result; the answer to it is
 * still the paper's, and this is the boundary that keeps the two apart. There
 * is nothing to game either way: a second attempt is refused (see the 409 in
 * submitAssessment), so the marked paper cannot be turned back into a better one.
 *
 * An assessor's override wins over the automatic verdict, the same way it wins
 * in the score printed beside it — a student must never read "incorrect" on an
 * item their assessor has since allowed.
 */
function resultItems(result) {
  const overrides = result?.review?.overrides ?? {};
  // What the student put down, from the submission itself. Sending it back is
  // what lets a sat paper be reopened as the paper they actually sat: without
  // it the questions return blank, and the marks have nothing to sit against.
  const chosen = new Map(
    (result?.answers ?? []).map((answer) => [asId(answer.itemId), answer.choice ?? null])
  );

  return (result?.aiGrading?.items ?? []).map((item) => ({
    itemId: asId(item.itemId),
    verdict: overrides[asId(item.itemId)] ?? item.verdict ?? null,
    choice: chosen.get(asId(item.itemId)) ?? item.chosen ?? null
  }));
}

function resultSummary(result, summary, attempts = []) {
  if (!result) return null;
  const score = effectiveScore(result);
  const limit = attemptLimitFor(summary.scope);
  const used = Math.max(attempts.length, attemptNo(result));

  return {
    score,
    total: summary.totalPoints,
    passMark: summary.passMark,
    passed: score >= summary.passMark,
    submittedAt: result.submittedAt ?? null,
    reviewStatus: result.review?.status ?? "pending",
    items: resultItems(result),
    // What the rail needs to offer a retake, or explain why it cannot.
    attempt: attemptNo(result),
    attemptsUsed: used,
    attemptsAllowed: Number.isFinite(limit) ? limit : null,
    attemptsLeft: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
    canRetake: retakeState(result, summary, used).allowed
  };
}

/**
 * Whether this paper may be sat again, and why not when it may not.
 *
 * An issued credential closes the final for good. The latest attempt is the one
 * that counts, so sitting it again could only take a credential away from a
 * student who has already earned it — which is not a retake, it is a forfeit.
 */
export function retakeState(result, summary, used) {
  if (!result) return { allowed: true, reason: null };

  if (summary.scope === "final" && result.credential?.status === "issued") {
    return { allowed: false, reason: "Your credential for this course has been issued." };
  }

  const limit = attemptLimitFor(summary.scope);
  if (used >= limit) {
    return { allowed: false, reason: `You have used all ${limit} attempts at this assessment.` };
  }

  return { allowed: true, reason: null };
}

/**
 * A row for a quiz that does not exist yet.
 *
 * The rail is built entirely from what this endpoint returns, so before any
 * quizzes are written it had nothing to draw and a course looked as though it
 * had no assessments at all. A placeholder keeps the shape of the course
 * visible — the student can see a quiz is coming for each lesson, and where the
 * final sits — without pretending there is a paper to sit.
 *
 * It carries no id that resolves to a document, so the two endpoints that serve
 * questions answer 404 if one is ever opened directly — a row whose quiz is
 * ready to be written has to go through `POST .../modules/:moduleId/assessment`
 * instead. `placeholder: true` is what the rail keys off to skip the score line.
 */
function placeholderRow(courseId, { scope, moduleId = null, reason = null, needsGeneration = false }) {
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
    /**
     * The lesson is finished and this quiz is the student's to take — it just
     * has not been written yet, and will be the moment they ask for it.
     *
     * Kept separate from `locked` because the two mean opposite things to the
     * person reading them: locked is "you have something to finish first",
     * this is "press the button when you are ready".
     */
    needsGeneration,
    locked: !needsGeneration,
    // A row the student may act on has nothing to explain. The fallback is for
    // the locked ones, where the reason is the whole point of the row.
    reason: needsGeneration
      ? null
      : (reason ??
        (scope === "final"
          ? "The final assessment has not been prepared yet."
          : "This quiz has not been prepared yet.")),
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
        result: resultSummary(
          state.resultByAssessment.get(asId(doc._id)),
          summary,
          state.attemptsByAssessment.get(asId(doc._id)) ?? []
        )
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

  /**
   * A lesson this student has finished, with no quiz behind it, is theirs to
   * take whenever they choose — the questions are written when they press the
   * button, not now. Reading this rail costs nothing and writes nothing, which
   * is the point: browsing a course must never spend anything.
   */
  state.modules.forEach((module) => {
    if (coveredModuleIds.has(asId(module._id))) return;

    const lessonDone = state.completedModuleIds.has(asId(module._id));

    assessments.push(
      placeholderRow(courseId, {
        scope: "lesson",
        moduleId: module._id,
        needsGeneration: lessonDone,
        reason: lessonDone ? null : "Finish this lesson to unlock its quiz."
      })
    );
  });

  if (!assessments.some((row) => row.scope === "final")) {
    // Free — the final is drawn from the lesson banks and makes no model call —
    // so it is attempted whenever every lesson quiz is in place.
    if (state.modules.length > 0 && coveredModuleIds.size === state.modules.length) {
      ensureFinalAssessment({ courseId }).catch(() => {});
    }
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

/**
 * POST /api/students/:studentId/modules/:moduleId/assessment
 *
 * "Take the Quiz" — the one call in the student app that can spend money, and
 * the only place a quiz is ever written.
 *
 * Deliberately not on lesson completion. A student who finishes a lesson and
 * stops there costs nothing; a lesson finished by thirty students who never
 * open the quiz costs nothing. The first student who says they are ready is who
 * causes the questions to exist, and everyone after them is handed the same
 * paper for free.
 *
 * The gate is checked here too, not just in the client. Otherwise a student
 * could spend a model call on a lesson they had not read.
 */
export async function prepareLessonAssessment(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { studentId, moduleId } = request.params;

  const module = await collection(MODULES_COLLECTION).findOne({
    _id: { $in: idCandidates(moduleId) }
  });
  if (!module) return response.status(404).json({ message: "Lesson not found." });

  const courseId = asId(module.courseId ?? "");
  const state = await loadCourseState(studentId, courseId);

  // Same gate as the quiz itself: the lesson has to be read first.
  if (!state.completedModuleIds.has(asId(module._id))) {
    return response.status(423).json({
      message: "Finish this lesson to unlock its quiz.",
      locked: true
    });
  }

  // Someone may have written it since the rail was drawn — a classmate, or this
  // student in another tab. Nothing to pay for.
  const existing = state.assessments.find(
    (doc) =>
      toAssessmentSummary(doc)?.scope === "lesson" && asId(doc.moduleId) === asId(module._id)
  );
  if (existing) {
    return response.json({
      assessment: { ...toAssessmentSummary(existing), locked: false, generated: false },
      generated: false
    });
  }

  const result = await ensureLessonAssessment({ courseId, moduleId: module._id });

  if (result.status === "created" || result.status === "skipped") {
    const written = await collection(ASSESSMENTS_COLLECTION).findOne({
      courseId: { $in: idCandidates(courseId) },
      moduleId: { $in: idCandidates(module._id) }
    });

    if (written) {
      return response.json({
        assessment: { ...toAssessmentSummary(written), locked: false },
        generated: result.status === "created"
      });
    }
  }

  // Nothing was written and nothing exists. Say which of the handful of reasons
  // it was, because "try again" is wrong advice for most of them.
  const reasons = {
    "no-source-text": "This lesson's text has not been prepared yet, so its quiz cannot be written.",
    "no-blueprint-row": "This lesson has no entry in the course blueprint, so there is nothing to write.",
    "no-blueprint": "This course has no assessment blueprint yet.",
    "recently-failed": "That did not work a moment ago. Try again shortly.",
    "auto-generation-disabled": "Quiz generation is switched off on this server."
  };

  return response.status(503).json({
    message:
      reasons[result.reason] ??
      "Your quiz could not be prepared just now. Please try again shortly.",
    reason: result.reason ?? "unknown"
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
    result: resultSummary(
      state.resultByAssessment.get(asId(doc._id)),
      summary,
      state.attemptsByAssessment.get(asId(doc._id)) ?? []
    )
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

  const summary = toAssessmentSummary(doc);
  const priorAttempts = state.attemptsByAssessment.get(asId(doc._id)) ?? [];
  const existing = state.resultByAssessment.get(asId(doc._id));

  // A retake is allowed; a fourth sitting of a final is not, and neither is
  // re-sitting a final whose credential is already in the student's hands.
  const retake = retakeState(existing, summary, priorAttempts.length);
  if (existing && !retake.allowed) {
    return response.status(409).json({
      message: retake.reason,
      result: resultSummary(existing, summary, priorAttempts)
    });
  }

  const attempt = priorAttempts.length + 1;
  const graded = gradeSubmission(doc, answers, { studentId });

  const record = {
    assessmentId: doc._id,
    moduleId: doc.moduleId ?? null,
    courseId: doc.courseId ?? null,
    studentId: String(studentId),
    submittedAt: new Date(),
    // Which sitting this was, and whether it is still the one that counts.
    // Every attempt is kept — a superseded row is history, not waste — but only
    // one per paper is ever graded, scored against, or shown.
    attempt,
    superseded: false,
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
      gradedBy: null,
      gradedAt: null
    },
    credential: { status: "none", name: null, issuedAt: null, issuedBy: null }
  };

  // Retire the earlier sittings first. Doing it before the insert means a
  // failure here leaves the student with their old attempt intact rather than
  // with two live ones, and the pair can never both read as current.
  if (priorAttempts.length > 0) {
    await collection(RESULTS_COLLECTION).updateMany(
      {
        studentId: { $in: idCandidates(studentId) },
        assessmentId: { $in: idCandidates(doc._id) }
      },
      { $set: { superseded: true } }
    );
  }

  await collection(RESULTS_COLLECTION).insertOne(record);

  /**
   * The badge this pass just earned, so the client can say so by name.
   *
   * Only a lesson quiz earns one — a final earns the course credential, which
   * is an assessor's to release. Sent only on a pass, and only here: this is
   * the one response that knows a badge was earned *just now* rather than at
   * some point in the past, which is what a congratulation needs.
   *
   * A catalog miss costs the student nothing but the popup — the badge itself
   * is derived from this result either way (see badges.service.js), so the
   * wall will still show it.
   */
  const passedLessonQuiz = graded.passed && summary?.scope === "lesson";
  const badge = passedLessonQuiz
    ? await lessonBadgeFor(doc.moduleId).catch(() => null)
    : null;

  return response.status(201).json({
    result: {
      score: graded.score,
      total: graded.total,
      passMark: graded.passMark,
      passed: graded.passed,
      correct: graded.correct,
      itemCount: graded.items.length,
      submittedAt: record.submittedAt,
      reviewStatus: "pending",
      attempt,
      attemptsAllowed: Number.isFinite(attemptLimitFor(summary.scope))
        ? attemptLimitFor(summary.scope)
        : null,
      attemptsLeft: Number.isFinite(attemptLimitFor(summary.scope))
        ? Math.max(0, attemptLimitFor(summary.scope) - attempt)
        : null,
      // Same shape resultSummary sends, so reopening the quiz later paints the
      // question strip exactly as it is painted the moment it is handed in.
      items: graded.items.map((item) => ({
        itemId: asId(item.itemId),
        verdict: item.verdict,
        choice: item.chosen ?? null
      }))
    },
    badge
  });
}
