import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import {
  credentialNameFor,
  gradeSubmission,
  isPosted,
  toAssessmentSummary,
  toStudentAssessment
} from "./assessments.format.js";
import { closeAttempt, openAttempt } from "./attempts.js";
import { scoreOf } from "../assessors/grading.js";
import { lessonBadgeFor } from "../badges/badges.service.js";
import { loadStudentRestriction, refuseRestrictedCourse } from "../lib/courseAccess.js";

/**
 * Taking a quiz: what is unlocked, what the questions are, and what a
 * submission scores.
 *
 * The gates are enforced here rather than in the rail. The client hides a
 * locked quiz, but hiding a button is not a rule — without this the lock is
 * one fetch away from being bypassed.
 *
 * The first gate is the assessor's, and it is the same one for every paper:
 * nothing a student can see exists until an assessor has generated it, read it
 * and posted it to the course. Before that the row is there but shut, and it
 * says who opens it rather than what the student has left to do — because the
 * student has nothing left to do.
 *
 * Behind that, the course's own two gates are unchanged:
 *   lesson quiz — opens once that lesson is marked complete.
 *   final       — opens once every lesson is complete *and* every posted lesson
 *                 quiz has been passed, since a passed quiz is what earns a badge.
 *
 * There is still no schedule anywhere in this. Posting is a single act that
 * applies to the whole course at once; from there a quiz opens for one student
 * the moment that student finishes reading, and stays shut for everyone else.
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

/** The score that counts. Marked at hand-in, and there is no second mark. */
const effectiveScore = (result) => scoreOf(result);

/**
 * The longest a sitting is believed to have lasted: twelve hours.
 *
 * The figure is timed by the student's own browser, so it is evidence rather
 * than fact. A tab left open overnight, a clock changed underneath it, or a
 * number typed by hand into the request would all otherwise be shown to an
 * assessor as how long somebody worked.
 */
const MAX_SITTING_MS = 12 * 60 * 60 * 1000;

/**
 * How long the sitting took, or null when the client did not say.
 *
 * Null rather than zero for a missing figure: no paper takes no time, and a
 * column of zeroes would read as a claim about every attempt handed in before
 * this was recorded.
 */
function sittingDuration(raw) {
  const ms = Math.round(Number(raw));
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, MAX_SITTING_MS);
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
 * Retaking costs nothing to generate. The paper was written once and every
 * sitting serves the same questions in a fresh order, so an unlimited quiz is
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

/**
 * How many times a paper has been taken, from every row kept for it.
 *
 * Not simply how many rows there are. A row written before retakes existed
 * carries no `attempt` at all, and a history missing a row would report fewer
 * takes than the live row says it is — so the count and the highest attempt
 * number are both consulted and the larger one wins. `live` is the row that
 * counts, passed separately because a caller may hold it when it has no
 * history to go with it.
 *
 * Shared with the assessor's student page, so the number an assessor reads is
 * the number the student was told they had used.
 */
export function attemptsUsedFrom(rows, live = null) {
  const list = Array.isArray(rows) ? rows : [];
  const highest = list.reduce((most, row) => Math.max(most, attemptNo(row)), 0);
  return Math.max(list.length, highest, live ? attemptNo(live) : 0);
}

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

  // Whether the course is still open to this student at all. Its run ending —
  // or the class holding them being switched off — shuts every gate below at
  // once (see courseAccess.js).
  const restriction = await loadStudentRestriction(studentId, courseId);

  return {
    assessments,
    modules,
    restriction,
    completedModuleIds: new Set(progress.map((entry) => asId(entry.moduleId))),
    attemptsByAssessment,
    resultByAssessment: new Map(
      [...attemptsByAssessment].map(([key, rows]) => [key, currentAttempt(rows)])
    )
  };
}

/**
 * What a student is told about a paper their assessor has not posted yet.
 *
 * Named rather than typed out at each of the four places it is needed, because
 * it is the sentence a student will read most often on the rail and the four
 * copies would drift apart the first time one of them was reworded.
 */
export function unreleasedReason(scope) {
  return scope === "final"
    ? "Your assessor will unlock this final exam."
    : "Your assessor will unlock this quiz.";
}

/**
 * Whether one assessment is open, and why not when it isn't. The reason is
 * returned so the UI can say what to finish rather than only that it is shut.
 */
export function lockStateFor(assessment, state) {
  const summary = toAssessmentSummary(assessment);

  // The assessor's gate comes first, and it outranks everything below it: a
  // student who has finished the lesson still has nothing to sit until the
  // paper has been released to their course.
  if (!isPosted(assessment)) {
    return { locked: true, reason: unreleasedReason(summary.scope) };
  }

  if (summary.scope === "lesson") {
    const done = state.completedModuleIds.has(asId(summary.moduleId));
    return done
      ? { locked: false, reason: null }
      : { locked: true, reason: "Finish this lesson to unlock its quiz." };
  }

  const lessonsLeft = state.modules.filter(
    (module) => !state.completedModuleIds.has(asId(module._id))
  ).length;

  // Only released quizzes stand between a student and the final. A draft is
  // the assessor's working copy, and demanding a pass in a paper nobody can
  // open would shut the final for good.
  const lessonQuizzes = state.assessments.filter(
    (candidate) => isPosted(candidate) && toAssessmentSummary(candidate).scope === "lesson"
  );
  const quizzesLeft = lessonQuizzes.filter((quiz) => {
    const normalized = toAssessmentSummary(quiz);
    return !resultPassed(state.resultByAssessment.get(asId(quiz._id)), normalized);
  }).length;

  if (lessonsLeft === 0 && quizzesLeft === 0) return { locked: false, reason: null };

  const parts = [];
  if (lessonsLeft > 0) parts.push(`${lessonsLeft} lesson${lessonsLeft === 1 ? "" : "s"}`);
  if (quizzesLeft > 0) parts.push(`${quizzesLeft} quiz${quizzesLeft === 1 ? "" : "zes"}`);

  return { locked: true, reason: `Complete ${parts.join(" and ")} to unlock the final exam.` };
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
 * The verdicts are the ones written at hand-in, and nothing overrides them: an
 * assessor no longer re-marks a handed-in paper, so what the key said is what
 * the student is shown.
 */
function resultItems(result) {
  // What the student put down, from the submission itself. Sending it back is
  // what lets a sat paper be reopened as the paper they actually sat: without
  // it the questions return blank, and the marks have nothing to sit against.
  const chosen = new Map(
    (result?.answers ?? []).map((answer) => [asId(answer.itemId), answer.choice ?? null])
  );

  return (result?.aiGrading?.items ?? []).map((item) => ({
    itemId: asId(item.itemId),
    verdict: item.verdict ?? null,
    choice: chosen.get(asId(item.itemId)) ?? item.chosen ?? null
  }));
}

function resultSummary(result, summary, attempts = [], restriction = null) {
  if (!result) return null;
  const score = effectiveScore(result);
  const limit = attemptLimitFor(summary.scope);
  const used = attemptsUsedFrom(attempts, result);

  return {
    score,
    total: summary.totalPoints,
    passMark: summary.passMark,
    passed: score >= summary.passMark,
    submittedAt: result.submittedAt ?? null,
    // How long the sitting took. Null on every paper handed in before this was
    // recorded, which is all of them until the first one after this change.
    durationMs: result.durationMs ?? null,
    items: resultItems(result),
    // What the rail needs to offer a retake, or explain why it cannot.
    attempt: attemptNo(result),
    attemptsUsed: used,
    attemptsAllowed: Number.isFinite(limit) ? limit : null,
    attemptsLeft: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
    // A course that has ended offers no further sitting, however many
    // attempts the paper itself would still allow.
    canRetake: !restriction && retakeState(result, summary, used).allowed
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
 * A row for a paper the student cannot see: never written, or written and not
 * yet posted.
 *
 * The rail is built entirely from what this endpoint returns, so before any
 * quizzes are released it had nothing to draw and a course looked as though it
 * had no assessments at all. A placeholder keeps the shape of the course
 * visible — the student can see a quiz is coming for each lesson, and where the
 * final sits — without pretending there is a paper to sit.
 *
 * A draft is shown this way too, rather than as itself. Its length, pass mark
 * and title are all still the assessor's to change, and putting numbers on the
 * rail that move overnight is worse than putting none there at all.
 *
 * It carries no id that resolves to a document a student may open, so the two
 * endpoints that serve questions answer 404 if one is used directly.
 * `placeholder: true` is what the rail keys off to skip the score line.
 */
function placeholderRow(courseId, { scope, moduleId = null, reason = null }) {
  return {
    id: `placeholder:${scope}:${asId(moduleId ?? courseId)}`,
    courseId: courseId ?? null,
    moduleId: scope === "final" ? null : moduleId,
    scope,
    title: "",
    description: "",
    pointsPerItem: 0,
    itemCount: 0,
    totalPoints: 0,
    passMark: 0,
    timeLimitMinutes: null,
    status: "draft",
    source: null,
    placeholder: true,
    locked: true,
    // Who opens this, not what the student has left to do — because until the
    // assessor posts it there is nothing the student can do about it.
    reason: reason ?? unreleasedReason(scope),
    result: null
  };
}

/**
 * GET /api/students/:studentId/courses/:courseId/assessments
 *
 * The rail's source of truth: every posted quiz in the course, each with its
 * lock state and the student's own result. Lessons whose quiz is unwritten or
 * still a draft, and a course whose final is either, get a locked placeholder
 * so the rail is never empty.
 */
export async function getCourseAssessmentsForStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { studentId, courseId } = request.params;
  const state = await loadCourseState(studentId, courseId);

  // Released papers only. A draft belongs to the assessor who is still working
  // on it; the rail shows it as a lesson whose quiz is coming, which is what it
  // is from where the student is sitting.
  const released = state.assessments.filter((doc) => isPosted(doc));

  const assessments = released
    .map((doc) => {
      const summary = toAssessmentSummary(doc);
      if (!summary) return null;
      return {
        ...summary,
        ...lockStateFor(doc, state),
        result: resultSummary(
          state.resultByAssessment.get(asId(doc._id)),
          summary,
          state.attemptsByAssessment.get(asId(doc._id)) ?? [],
          state.restriction
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

  // A lesson with no released quiz behind it still gets its row, so the rail
  // shows the shape of the whole course. Reading this writes nothing and costs
  // nothing — generation is the assessor's, and happens on their screen.
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

  /**
   * The course is closed, so the rail closes with it.
   *
   * A paper this student has already sat stays open when the course simply
   * ended: the mark is theirs, and reopening it is reading, not working. A
   * class switched off keeps nothing open — it is not a run finishing but the
   * class being taken off — so every row shuts, sat or not.
   *
   * Either way the row carries the closing's own reason, because no amount of
   * finishing will open it now.
   */
  if (state.restriction) {
    const suspended = Boolean(state.restriction.suspended);

    for (const row of assessments) {
      row.ended = Boolean(state.restriction.ended);
      row.suspended = suspended;
      if (row.result && !suspended) continue;

      row.locked = true;
      row.reason = state.restriction.reason;
    }
  }

  return response.json({
    assessments,
    pending: released.length === 0
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

  // An ended course still hands back a paper this student sat — that is their
  // own record — and refuses one they never reached. A switched-off class is
  // not a calendar closing a course but the class being taken off; it hands
  // back nothing until it is switched on again.
  if (
    state.restriction &&
    (state.restriction.suspended || !state.resultByAssessment.get(asId(doc._id)))
  ) {
    return refuseRestrictedCourse(response, state.restriction);
  }

  const lock = lockStateFor(doc, state);

  if (lock.locked) {
    return response.status(423).json({ message: lock.reason, locked: true });
  }

  const summary = toAssessmentSummary(doc);
  const live = state.resultByAssessment.get(asId(doc._id));

  /*
   * From here the paper is open on somebody's screen, which is the only
   * moment the server is ever told about (see attempts.js).
   *
   * Two things are not that. Staff read this endpoint too — an assessor
   * opening a student's paper is not the student working on it — so only a
   * request the student makes about themselves counts. And a paper that has
   * already been marked reopens as a review of the mark, which is the same
   * request as starting another attempt; the client marks the second one
   * `?retake=1` because nothing on the wire could otherwise tell them apart.
   */
  const isTheStudent = String(studentId) === String(request.session?.id ?? "");
  const retaking = String(request.query?.retake ?? "") === "1";
  if (isTheStudent && (!live || retaking)) {
    await openAttempt({ studentId, assessment: doc });
  }

  return response.json({
    // Every student sits every question; only the order differs, and it is
    // re-drawn here on each request.
    assessment: toStudentAssessment(doc),
    result: resultSummary(
      live,
      summary,
      state.attemptsByAssessment.get(asId(doc._id)) ?? [],
      state.restriction
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
  const { answers, durationMs } = request.body ?? {};

  if (!Array.isArray(answers)) {
    return response.status(400).json({ message: "answers must be an array." });
  }

  const doc = await findAssessment(assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found." });

  const state = await loadCourseState(studentId, doc.courseId);

  // Nothing is marked for a course whose run is over, whatever the rail said
  // when this paper was opened.
  if (state.restriction) return refuseRestrictedCourse(response, state.restriction);

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
  const graded = gradeSubmission(doc, answers);

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
    // How long the sitting took, as the client timed it. Clamped to something
    // a sitting could plausibly have lasted: the figure comes from the
    // student's own browser, so a negative or absurd number is discarded
    // rather than shown to an assessor as fact.
    durationMs: sittingDuration(durationMs),
    aiGrading: {
      // Marked by exact comparison against the key, not by a model — the AI's
      // job is writing the questions, not scoring these two item types.
      status: "graded",
      source: "auto",
      score: graded.score,
      items: graded.items
    },
    // Only the final earns a credential, and issuing it is the assessor's act
    // — this puts it in front of them on the Credentials screen, which is what
    // "pending" means. A lesson quiz earns a badge instead (below): that one is
    // the student's the moment they pass it and is nobody's to release, so a
    // passing quiz must never write a pending credential. It used to, and the
    // assessor was being asked to approve every badge in the course.
    credential:
      graded.passed && summary?.scope === "final"
        ? { status: "pending", name: credentialNameFor(doc), issuedAt: null, issuedBy: null }
        : { status: "none", name: null, issuedAt: null, issuedBy: null }
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

  // The paper is in, so it is no longer open. Done after the insert: a row
  // left behind by a failed write says "still working", which is true, and
  // one cleared before a failed write would say the opposite.
  await closeAttempt({ studentId, assessmentId: doc._id });

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
      durationMs: record.durationMs,
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
