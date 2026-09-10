import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { loadAuthoringRestriction, refuseRestrictedCourse } from "../lib/courseAccess.js";
import { sortLessons } from "../lib/lessonOrder.js";
import {
  DEFAULT_FINAL_MINUTES,
  DEFAULT_PASS_RATIO,
  assessmentStatus,
  isPosted,
  normalizeAssessment,
  normalizeItem,
  normalizeMinutes,
  toMarkedPaper
} from "../assessments/assessments.format.js";
import { openAttemptsByAssessment, takerCounts } from "../assessments/attempts.js";
import {
  assembleFinalAssessment,
  ensureAssessmentIndexes,
  generateModuleAssessment
} from "../assessments/assessments.generate.js";
import {
  courseCode,
  courseTitle,
  findAssignedCourse,
  moduleFilterForCourse,
  studentName,
  surnameFirst
} from "./assessors.controller.js";
import { scoreOf } from "./grading.js";

/**
 * Generating assessments, from the assessor's side.
 *
 * The course used to write its own papers: a student who finished a lesson
 * pressed "Take the Quiz" and the questions were generated on the spot, for
 * them and for everyone after them. That put the one paid call in the system
 * behind a student's click, and it meant nobody read a paper before a class
 * sat it — a question the model got wrong was found by the students.
 *
 * Releasing is the assessor's act now, and it is three steps rather than one:
 *
 *   generate — write a draft from the lesson's extracted text. Nothing a
 *              student can see changes; this is the only step that costs.
 *   correct  — read the questions and their answers, and fix the ones that are
 *              wrong. Every question is editable, one item at a time.
 *   post     — release it to the course. Every student enrolled in it gets the
 *              same paper from that moment; before it, none of them do.
 *
 * The source material is the extracted lesson text (`ModuleText`) — the same
 * text the student's reader renders, never the PDF behind it. That is what the
 * `hasText` field below reports on: a lesson whose text has not been extracted
 * cannot have a quiz written from it, and saying so before the assessor presses
 * generate is cheaper than a failed call afterwards.
 */

const ASSESSMENTS_COLLECTION = "Assessment";
const MODULES_COLLECTION = "LearningModule";
const RESULTS_COLLECTION = "StudentResult";
const TEXT_COLLECTION = "ModuleText";
const STUDENTS_COLLECTION = "Student";

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

/**
 * The assessor and the course from the route, or the response that says the
 * course was not found.
 *
 * The assessor is already settled: requireOwnAssessor resolved `:assessorId`
 * and refused anyone it does not belong to. What is left is whether this course
 * is one of theirs, which is what stops an assessor writing papers into a
 * colleague's course — one function rather than six copies that could drift.
 */
async function resolveScope(request, response) {
  if (!databaseReady()) {
    serviceUnavailable(response);
    return null;
  }

  // Resolved and checked against the session by requireOwnAssessor.
  const assessor = request.assessor;

  const course = await findAssignedCourse(assessor, request.params.courseId);
  if (!course) {
    response.status(404).json({ message: "Course not found for this assessor." });
    return null;
  }

  return { assessor, course };
}

/**
 * The same scope, but only while the course is still open to authoring.
 *
 * Two things close one: its run ends, or the last of its classes is switched
 * off in the admin console (see lib/courseAccess.js). Either way there is
 * nobody who can be given a paper, and the console used to let one be written
 * and posted anyway — the assessor found out when a student was refused.
 *
 * Guards the three presses that put something new in front of a class.
 * Reading a paper is never refused, and neither is unposting one: both leave a
 * class with less than it had, which a closed course is no reason to prevent.
 */
async function resolveWritableScope(request, response) {
  const scope = await resolveScope(request, response);
  if (!scope) return null;

  const restriction = await loadAuthoringRestriction(scope.course);
  if (restriction) {
    refuseRestrictedCourse(response, restriction);
    return null;
  }

  return scope;
}

/** Every assessment written for a course, drafts included. */
async function assessmentsForCourse(course) {
  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) return [];
  return collection(ASSESSMENTS_COLLECTION)
    .find({ courseId: { $in: idCandidates(course._id) } })
    .toArray();
}

/**
 * How many papers have been handed in against each assessment.
 *
 * The number that decides whether a paper may still be rewritten. Once a class
 * has sat it, its questions are what the marks on record were earned against.
 */
async function submissionCounts(assessmentIds) {
  const counts = new Map();
  if (assessmentIds.length === 0 || !(await collectionExists(RESULTS_COLLECTION))) return counts;

  const results = await collection(RESULTS_COLLECTION)
    .find(
      { assessmentId: { $in: assessmentIds.flatMap((id) => idCandidates(id)) } },
      { projection: { assessmentId: 1, studentId: 1 } }
    )
    .toArray();

  results.forEach((result) => {
    const key = asId(result.assessmentId);
    // Papers handed in, and the people who handed them in. The two differ by
    // every retake: three attempts at one quiz are three rows and one
    // student, and the cards on the generate screen count students.
    const entry = counts.get(key) ?? { submissions: 0, students: new Set() };
    entry.submissions += 1;
    entry.students.add(asId(result.studentId));
    counts.set(key, entry);
  });

  return counts;
}

/** How many people are enrolled on this course — the "all students" card. */
async function enrolledCount(course) {
  if (!(await collectionExists(STUDENTS_COLLECTION))) return 0;

  return collection(STUDENTS_COLLECTION).countDocuments({
    enrolledCourses: { $in: idCandidates(course._id) }
  });
}

/**
 * The four numbers a posted paper is read by: everyone on the course, and how
 * they divide between never opened it, has it open, and handed it in.
 *
 * Only for a posted paper. A draft has been released to nobody, so "8 not
 * started" would be counting people against a paper they cannot reach.
 */
function takersFor(doc, { counts, opens, students }) {
  if (!doc || !isPosted(doc)) return null;

  const key = asId(doc._id);
  return takerCounts({
    students,
    submitted: counts.get(key)?.students ?? null,
    open: opens.get(key) ?? null
  });
}

/**
 * A row for the generate screen: what exists for this paper and what state it
 * is in, without the questions themselves.
 */
function assessmentRow(doc, submissions = 0, takers = null) {
  if (!doc) return null;

  const normalized = normalizeAssessment(doc);
  return {
    id: normalized.id,
    scope: normalized.scope,
    moduleId: normalized.moduleId ? asId(normalized.moduleId) : null,
    title: normalized.title,
    status: normalized.status,
    postedAt: normalized.postedAt,
    postedBy: doc.postedBy ?? null,
    // One number: the paper is its questions, and every student sits all of
    // them.
    itemCount: normalized.itemCount,
    timeLimitMinutes: normalized.timeLimitMinutes,
    totalPoints: normalized.totalPoints,
    passMark: normalized.passMark,
    generatedAt: doc.source?.generatedAt ?? null,
    submissions,
    // Null until the paper is posted — see takersFor.
    takers
  };
}

/**
 * The whole paper, answer keys included.
 *
 * The opposite of `toStudentAssessment`, and deliberately so: correcting a
 * question means seeing which answer the model marked as right. This is the one
 * place a paper leaves the server with its keys attached — to the assessor the
 * course is assigned to, and to nobody else.
 */
function assessmentDetail(doc, submissions = 0, takers = null) {
  const normalized = normalizeAssessment(doc);

  return {
    ...assessmentRow(doc, submissions, takers),
    description: normalized.description,
    // Numbered for the screen. The stored `n` follows the paper as it was
    // written; this follows the list as it is being read.
    items: normalized.items.map((item, index) => ({ ...item, n: index + 1 }))
  };
}

/**
 * The assessment named by the route, but only if it belongs to this course.
 * The id comes from the client, and an assessor must not reach another
 * course's paper by guessing one.
 */
async function findCourseAssessment(course, assessmentId) {
  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) return null;

  return collection(ASSESSMENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(assessmentId) },
    courseId: { $in: idCandidates(course._id) }
  });
}

/* ─────────────────────── The generate screen ─────────────────────── */

/**
 * GET /api/assessors/:assessorId/classes/:courseId/assessments
 *
 * One row per lesson plus the final: what has been written, what has been
 * posted, and — for the lessons with nothing yet — whether there is any
 * extracted text to write from.
 */
export async function getCourseAssessments(request, response) {
  const scope = await resolveScope(request, response);
  if (!scope) return undefined;

  const { course } = scope;

  const [modules, assessments] = await Promise.all([
    (await collectionExists(MODULES_COLLECTION))
      ? collection(MODULES_COLLECTION).find(moduleFilterForCourse(course)).toArray()
      : [],
    assessmentsForCourse(course)
  ]);

  const lessons = sortLessons(modules);

  const texts =
    lessons.length > 0 && (await collectionExists(TEXT_COLLECTION))
      ? await collection(TEXT_COLLECTION)
          .find(
            { moduleId: { $in: lessons.flatMap((lesson) => idCandidates(lesson._id)) } },
            { projection: { moduleId: 1, hasText: 1, textLength: 1 } }
          )
          .toArray()
      : [];

  const textByModule = new Map(texts.map((doc) => [asId(doc.moduleId), doc]));
  const quizByModule = new Map(
    assessments.filter((doc) => doc.scope !== "final").map((doc) => [asId(doc.moduleId), doc])
  );
  const finalDoc = assessments.find((doc) => doc.scope === "final") ?? null;

  const assessmentIds = assessments.map((doc) => doc._id);
  const [counts, opens, enrolled] = await Promise.all([
    submissionCounts(assessmentIds),
    openAttemptsByAssessment(assessmentIds),
    enrolledCount(course)
  ]);
  const tally = { counts, opens, students: enrolled };

  // Why the buttons on this screen are off, before they are pressed. The
  // endpoints refuse a closed course either way; sending the reason here is
  // what lets the screen say so rather than leave a dead button.
  const closed = await loadAuthoringRestriction(course);

  const rows = lessons.map((lesson, index) => {
    const quiz = quizByModule.get(asId(lesson._id)) ?? null;
    const text = textByModule.get(asId(lesson._id));

    return {
      moduleId: asId(lesson._id),
      n: index + 1,
      title: lesson.title ?? lesson.name ?? `Lesson ${index + 1}`,
      // The generator reads the extracted text, not the PDF, so this is what
      // decides whether generating is worth pressing at all.
      hasText: Boolean(text?.hasText),
      textLength: text?.textLength ?? 0,
      assessment: quiz
        ? assessmentRow(
            quiz,
            counts.get(asId(quiz._id))?.submissions ?? 0,
            takersFor(quiz, tally)
          )
        : null
    };
  });

  return response.json({
    course: {
      id: asId(course._id),
      code: courseCode(course),
      name: courseTitle(course),
      students: enrolled,
      closed
    },
    defaultFinalMinutes: DEFAULT_FINAL_MINUTES,
    lessons: rows,
    final: finalDoc
      ? assessmentRow(
          finalDoc,
          counts.get(asId(finalDoc._id))?.submissions ?? 0,
          takersFor(finalDoc, tally)
        )
      : null
  });
}

/**
 * GET /api/assessors/:assessorId/classes/:courseId/assessments/:assessmentId
 *
 * One paper in full, keys and all — the question list on the left of the
 * generate screen.
 */
export async function getCourseAssessment(request, response) {
  const scope = await resolveScope(request, response);
  if (!scope) return undefined;

  const doc = await findCourseAssessment(scope.course, request.params.assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found in this course." });

  const [counts, opens, enrolled] = await Promise.all([
    submissionCounts([doc._id]),
    openAttemptsByAssessment([doc._id]),
    enrolledCount(scope.course)
  ]);

  return response.json({
    assessment: assessmentDetail(
      doc,
      counts.get(asId(doc._id))?.submissions ?? 0,
      takersFor(doc, { counts, opens, students: enrolled })
    )
  });
}

/* ─────────────────────── Generating ─────────────────────── */

/** Why a generation attempt produced nothing, in words an assessor can act on. */
const GENERATION_REASONS = {
  "no-source-text":
    "This lesson has no extracted text yet, so the generator has nothing to read. Re-process the module first.",
  "no-blueprint-row":
    "This lesson has no row in the course's Table of Specification. Set the number of items yourself to generate anyway.",
  "no-blueprint":
    "This course has no Table of Specification yet. Set the number of items yourself to generate anyway.",
  "no-lesson-quizzes":
    "The final is drawn from the lesson quizzes, so generate at least one lesson quiz first.",
  "no-lesson-items": "The lesson quizzes hold no usable questions for a final to draw from.",
  "bank-too-small":
    "The lesson quizzes together hold fewer questions than the final asks for. Generate more lesson quizzes, or ask for a shorter assessment.",
  "module-not-found": "That lesson no longer exists.",
  "generation-failed": "The generator could not be reached. Try again shortly.",
  "database-not-connected": "The database is not connected."
};

/**
 * POST /api/assessors/:assessorId/classes/:courseId/assessments/generate
 * Body: { scope: "lesson" | "final", moduleId?, itemCount?, timeLimitMinutes? }
 *
 * Writes a draft and hands it straight back with its answer key, because the
 * assessor's next act is to read it. Nothing a student can see changes here.
 *
 * A paper that has already been sat is never regenerated. Its questions are
 * what the marks on record were earned against, and rewriting them would leave
 * every one of those marks pointing at a question that no longer exists.
 */
export async function generateCourseAssessment(request, response) {
  const scope = await resolveWritableScope(request, response);
  if (!scope) return undefined;

  const { course } = scope;
  const body = request.body ?? {};
  const isFinal = body.scope === "final";
  const moduleId = body.moduleId ?? null;
  const itemCount = body.itemCount ?? null;
  const timeLimitMinutes = normalizeMinutes(body.timeLimitMinutes);

  if (!isFinal && !moduleId) {
    return response.status(400).json({ message: "moduleId is required for a lesson quiz." });
  }

  const existing = isFinal
    ? ((await assessmentsForCourse(course)).find((doc) => doc.scope === "final") ?? null)
    : await collection(ASSESSMENTS_COLLECTION).findOne({
        courseId: { $in: idCandidates(course._id) },
        moduleId: { $in: idCandidates(moduleId) }
      });

  if (existing) {
    const taken = (await submissionCounts([existing._id])).get(asId(existing._id)) ?? 0;
    if (taken > 0) {
      return response.status(409).json({
        message: `${taken} student${taken === 1 ? " has" : "s have"} already taken this assessment, so its questions can no longer be rewritten.`,
        assessmentId: asId(existing._id)
      });
    }
  }

  await ensureAssessmentIndexes();

  const result = isFinal
    ? await assembleFinalAssessment({
        courseId: course._id,
        itemCount,
        timeLimitMinutes: timeLimitMinutes ?? DEFAULT_FINAL_MINUTES,
        status: "draft",
        replaceExisting: true
      })
    : await generateModuleAssessment({
        courseId: course._id,
        moduleId,
        itemCount,
        timeLimitMinutes,
        status: "draft",
        replaceExisting: true
      });

  if (result.status !== "created" && result.status !== "replaced") {
    const message =
      GENERATION_REASONS[result.reason] ??
      (result.status === "rejected"
        ? `The generated questions did not pass validation: ${(result.problems ?? []).join(" ")}`
        : "Nothing could be generated for this assessment.");

    return response.status(result.status === "error" ? 503 : 422).json({
      message,
      reason: result.reason ?? result.status
    });
  }

  const doc = await findCourseAssessment(course, result.assessmentId);
  if (!doc) {
    return response.status(500).json({ message: "The assessment was written but could not be read back." });
  }

  return response.json({
    assessment: assessmentDetail(doc, 0),
    replaced: result.status === "replaced",
    usage: result.usage ?? null
  });
}

/* ─────────────────────── Correcting ─────────────────────── */

/**
 * PUT /api/assessors/:assessorId/classes/:courseId/assessments/:assessmentId
 * Body: { items?: [{ id, q?, choices?, key?, type? }], timeLimitMinutes? }
 *
 * The correction step: the assessor found a question whose stated answer is
 * wrong, and fixes it.
 *
 * `items` is a patch rather than a replacement. The assessor sends only the
 * questions they changed, keyed by id, and the rest of the paper is left
 * exactly as it was — sending the whole paper back would let a stale screen
 * quietly undo a fix made from another one.
 *
 * The paper's length is not editable here. It is however many questions the
 * paper has, and changing it would mean adding or deleting questions rather
 * than moving a number.
 *
 * An edited item goes through the same normaliser a generated one does, so a
 * key naming no choice is refused here rather than marking a whole class wrong.
 */
export async function updateCourseAssessment(request, response) {
  const scope = await resolveWritableScope(request, response);
  if (!scope) return undefined;

  const { course } = scope;
  const doc = await findCourseAssessment(course, request.params.assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found in this course." });

  const taken = (await submissionCounts([doc._id])).get(asId(doc._id)) ?? 0;
  if (taken > 0) {
    return response.status(409).json({
      message: `${taken} student${taken === 1 ? " has" : "s have"} already taken this assessment, so it can no longer be edited.`
    });
  }

  const body = request.body ?? {};
  const patches = new Map(
    (Array.isArray(body.items) ? body.items : [])
      .filter((item) => item && item.id != null)
      .map((item) => [String(item.id), item])
  );

  const problems = [];
  const items = (Array.isArray(doc.items) ? doc.items : []).map((stored, index) => {
    const patch = patches.get(String(stored.id));
    if (!patch) return stored;

    const merged = normalizeItem(
      {
        ...stored,
        type: patch.type ?? stored.type,
        q: patch.q ?? stored.q,
        choices: patch.choices ?? stored.choices,
        key: patch.key ?? stored.key
      },
      index
    );

    if (!merged) {
      problems.push(
        `Question ${index + 1} could not be saved — a question needs its text, at least two choices, and a correct answer that is one of them.`
      );
      return stored;
    }

    // The id, the lesson and the topic are not the assessor's to change: the
    // first is what a mark points at, and the other two are how that mark finds
    // its way back to a lesson in the skill gap report.
    return {
      ...merged,
      id: stored.id,
      moduleId: stored.moduleId ?? null,
      topic: stored.topic ?? null
    };
  });

  if (problems.length > 0) {
    return response.status(422).json({ message: problems.join(" "), problems });
  }

  const update = { items, updatedAt: new Date() };

  if ("timeLimitMinutes" in body) update.timeLimitMinutes = normalizeMinutes(body.timeLimitMinutes);

  // What the paper is worth follows its questions, so it is rewritten here
  // rather than left to drift from a length that no longer matches.
  update.totalPoints = items.length * (Number(doc.pointsPerItem) || 1);
  update.passMark = Math.ceil(update.totalPoints * DEFAULT_PASS_RATIO);

  await collection(ASSESSMENTS_COLLECTION).updateOne({ _id: doc._id }, { $set: update });

  const saved = await findCourseAssessment(course, doc._id);
  return response.json({ assessment: assessmentDetail(saved, 0) });
}

/* ─────────────────────── Posting ─────────────────────── */

/**
 * POST /api/assessors/:assessorId/classes/:courseId/assessments/:assessmentId/post
 *
 * Releases the paper to the course. One act, one course, every student in it —
 * there is nothing per-student to set, because an Assessment holds no student.
 *
 * From here the course's own gates take over: a lesson quiz still waits for
 * that student to finish the lesson, and the final still waits for all of them.
 */
export async function postCourseAssessment(request, response) {
  const scope = await resolveWritableScope(request, response);
  if (!scope) return undefined;

  const { assessor, course } = scope;
  const doc = await findCourseAssessment(course, request.params.assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found in this course." });

  if ((doc.items ?? []).length === 0) {
    return response.status(422).json({ message: "This assessment has no questions to post." });
  }

  if (assessmentStatus(doc) === "posted") {
    return response.json({ assessment: assessmentRow(doc), alreadyPosted: true });
  }

  await collection(ASSESSMENTS_COLLECTION).updateOne(
    { _id: doc._id },
    {
      $set: {
        status: "posted",
        postedAt: new Date(),
        postedBy: assessor.full_name ?? assessor.name ?? assessor.assessor_id ?? null
      }
    }
  );

  const saved = await findCourseAssessment(course, doc._id);
  return response.json({ assessment: assessmentRow(saved) });
}

/**
 * POST /api/assessors/:assessorId/classes/:courseId/assessments/:assessmentId/unpost
 *
 * Takes a paper back off the course. Refused once anyone has sat it: their
 * marks are against this paper, and unposting it would leave a result
 * pointing at something the course no longer offers.
 */
export async function unpostCourseAssessment(request, response) {
  const scope = await resolveScope(request, response);
  if (!scope) return undefined;

  const { course } = scope;
  const doc = await findCourseAssessment(course, request.params.assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found in this course." });

  const taken = (await submissionCounts([doc._id])).get(asId(doc._id)) ?? 0;
  if (taken > 0) {
    return response.status(409).json({
      message: `${taken} student${taken === 1 ? " has" : "s have"} already taken this assessment, so it cannot be unposted.`
    });
  }

  await collection(ASSESSMENTS_COLLECTION).updateOne(
    { _id: doc._id },
    { $set: { status: "draft", postedAt: null, postedBy: null } }
  );

  const saved = await findCourseAssessment(course, doc._id);
  return response.json({ assessment: assessmentRow(saved) });
}

/* ─────────────────────────── Results ─────────────────────────── */

/**
 * One posted paper, student by student.
 *
 * The cards on the generate screen say how many; this says who — chase the two
 * who have not started, look at the one who scored three.
 *
 * Every enrolled student has a row whether or not they have touched the paper,
 * because the ones who have not are the point of the screen. A row is built
 * from three reads that each know a different part of it: the roll, what has
 * been handed in, and what is open right now.
 *
 * The list is the class register: surname first, in alphabetical order, so a
 * name can be found by running down the column the way a register is read.
 */
export async function getAssessmentResults(request, response) {
  const scope = await resolveScope(request, response);
  if (!scope) return undefined;

  const { course } = scope;
  const doc = await findCourseAssessment(course, request.params.assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found in this course." });

  const paper = normalizeAssessment(doc);

  const [students, results, opens] = await Promise.all([
    (await collectionExists(STUDENTS_COLLECTION))
      ? collection(STUDENTS_COLLECTION)
          .find({ enrolledCourses: { $in: idCandidates(course._id) } })
          .toArray()
      : [],
    (await collectionExists(RESULTS_COLLECTION))
      ? collection(RESULTS_COLLECTION)
          .find({ assessmentId: { $in: idCandidates(doc._id) } })
          .toArray()
      : [],
    openAttemptsByAssessment([doc._id])
  ]);

  const openedByStudent = new Map();
  const openRows = await openAttemptRows(doc._id);
  openRows.forEach((row) => openedByStudent.set(asId(row.studentId), row.openedAt ?? null));

  // A student's attempts at this paper, newest first, so the row can pick out
  // the live one.
  const attemptsByStudent = new Map();
  results.forEach((result) => {
    const key = asId(result.studentId);
    if (!attemptsByStudent.has(key)) attemptsByStudent.set(key, []);
    attemptsByStudent.get(key).push(result);
  });
  attemptsByStudent.forEach((list) =>
    list.sort((a, b) => new Date(b.submittedAt ?? 0) - new Date(a.submittedAt ?? 0))
  );

  const working = opens.get(asId(doc._id)) ?? new Set();

  const rows = students
    .map((student) => {
      const key = asId(student._id);
      const attempts = attemptsByStudent.get(key) ?? [];
      const latest = attempts.find((row) => row.superseded !== true) ?? attempts[0] ?? null;
      const hasOpen = working.has(key);

      return {
        id: key,
        name: surnameFirst(student),
        sid: student.student_id ?? null,
        // Submitted beats open, the same order the cards count in: a student
        // retaking a paper has handed it in, and the retake is the second
        // thing about them.
        status: latest ? "submitted" : hasOpen ? "in-progress" : "not-started",
        // Only ever known for a paper that has been handed in. A student
        // working on one keeps their answers in their own browser until they
        // submit, so the server has nothing to report here and says so with a
        // null rather than a nought, which would read as "answered none".
        answered: latest ? answeredCount(latest) : null,
        itemCount: paper.itemCount,
        score: latest ? scoreOf(latest) : null,
        totalPoints: paper.totalPoints,
        passMark: paper.passMark,
        passed: latest ? scoreOf(latest) >= paper.passMark : null,
        startedAt: latest ? startedFrom(latest) : (openedByStudent.get(key) ?? null),
        submittedAt: latest?.submittedAt ?? null
      };
    })
    // Surname first, so this sorts the register the way a register is ordered.
    .sort((a, b) => a.name.localeCompare(b.name));

  return response.json({
    course: { id: asId(course._id), code: courseCode(course), name: courseTitle(course) },
    assessment: assessmentRow(
      doc,
      results.length,
      takersFor(doc, {
        counts: new Map([
          [asId(doc._id), { submissions: results.length, students: new Set(results.map((r) => asId(r.studentId))) }]
        ]),
        opens,
        students: students.length
      })
    ),
    rows
  });
}

/**
 * One student's handed-in paper, question by question.
 *
 * The register says a student scored 3 of 10. This says which 3 — the paper as
 * it was written, with the key and what they put down beside it.
 *
 * It reopens nothing. The mark was made against the key at hand-in and stands;
 * there is no route here that changes it, and the verdicts shown are the ones
 * stored on the submission rather than a second opinion worked out on the way
 * to the screen. What it is for is the question an assessor cannot otherwise
 * answer: a student disputes a mark, or an item everybody missed needs reading
 * to see whether the class or the question was at fault.
 *
 * The newest attempt, not every attempt: a retake supersedes the go before it,
 * and the mark that counts is the one the register is showing.
 */
export async function getStudentPaper(request, response) {
  const scope = await resolveScope(request, response);
  if (!scope) return undefined;

  const { course } = scope;
  const doc = await findCourseAssessment(course, request.params.assessmentId);
  if (!doc) return response.status(404).json({ message: "Assessment not found in this course." });

  // Enrolled on this course, not merely a student somewhere. The assessor's
  // own courses are all this route will open, and this is the second half of
  // that: their course, and one of the people on it.
  const student = (await collectionExists(STUDENTS_COLLECTION))
    ? await collection(STUDENTS_COLLECTION).findOne({
        _id: { $in: idCandidates(request.params.studentId) },
        enrolledCourses: { $in: idCandidates(course._id) }
      })
    : null;
  if (!student) {
    return response.status(404).json({ message: "Student not found on this course." });
  }

  const attempts = (await collectionExists(RESULTS_COLLECTION))
    ? await collection(RESULTS_COLLECTION)
        .find({
          assessmentId: { $in: idCandidates(doc._id) },
          studentId: { $in: idCandidates(student._id) }
        })
        .toArray()
    : [];

  attempts.sort((a, b) => new Date(b.submittedAt ?? 0) - new Date(a.submittedAt ?? 0));
  const latest = attempts.find((row) => row.superseded !== true) ?? attempts[0] ?? null;

  // Not an error, and not an empty paper either: a student who has not handed
  // this one in has nothing here to read, and the screen says that rather than
  // showing ten unanswered questions as though they had left them all blank.
  if (!latest) {
    return response.status(404).json({
      message: "This student has not handed in this assessment."
    });
  }

  const paper = normalizeAssessment(doc);
  const marked = toMarkedPaper(doc, latest);
  const score = scoreOf(latest);

  return response.json({
    student: {
      id: asId(student._id),
      name: surnameFirst(student),
      sid: student.student_id ?? null
    },
    assessment: {
      id: asId(doc._id),
      title: paper.title,
      scope: paper.scope,
      itemCount: marked.itemCount,
      pointsPerItem: paper.pointsPerItem,
      totalPoints: paper.totalPoints,
      passMark: paper.passMark
    },
    result: {
      score,
      totalPoints: paper.totalPoints,
      passMark: paper.passMark,
      passed: score >= paper.passMark,
      correct: marked.correct,
      answered: marked.answered,
      missing: marked.missing,
      submittedAt: latest.submittedAt ?? null,
      startedAt: startedFrom(latest),
      durationMs: latest.durationMs ?? null,
      // The clock the attempt ran against. How long somebody took means little
      // on its own — an hour is fast or slow depending on how long they
      // were given — so the limit travels with it.
      timeLimitMinutes: paper.timeLimitMinutes ?? null
    },
    items: marked.items
  });
}

/** Rows in the open-papers collection, which carry the time as well as the id. */
async function openAttemptRows(assessmentId) {
  if (!(await collectionExists("AssessmentAttempt"))) return [];
  return collection("AssessmentAttempt")
    .find(
      { assessmentId: { $in: idCandidates(assessmentId) } },
      { projection: { studentId: 1, openedAt: 1 } }
    )
    .toArray();
}

/** How many of the paper's questions this submission actually answered. */
function answeredCount(result) {
  const answers = Array.isArray(result?.answers) ? result.answers : [];
  return answers.filter((answer) => answer?.choice).length;
}

/**
 * When a submitted attempt began.
 *
 * Never recorded directly — the client times itself and sends the length with
 * the paper — so it is the hand-in less how long it took. A submission from
 * before durations were kept has nothing to work back from and says so.
 */
function startedFrom(result) {
  const submitted = result?.submittedAt ? new Date(result.submittedAt) : null;
  const took = Number(result?.durationMs);
  if (!submitted || Number.isNaN(submitted.getTime()) || !Number.isFinite(took) || took <= 0) {
    return null;
  }
  return new Date(submitted.getTime() - took).toISOString();
}
