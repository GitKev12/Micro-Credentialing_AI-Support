import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { sortLessons } from "../lib/lessonOrder.js";
import {
  DEFAULT_FINAL_MINUTES,
  DEFAULT_PASS_RATIO,
  assessmentStatus,
  normalizeAssessment,
  normalizeItem,
  normalizeMinutes
} from "../assessments/assessments.format.js";
import {
  assembleFinalAssessment,
  ensureAssessmentIndexes,
  generateModuleAssessment
} from "../assessments/assessments.generate.js";
import {
  courseCode,
  courseTitle,
  findAssessor,
  findAssignedCourse,
  moduleFilterForCourse
} from "./assessors.controller.js";

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
 *              wrong. The whole bank is editable, one item at a time.
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
 * The assessor and the course from the route, or the response that says which
 * of the two was not found.
 *
 * Every endpoint here begins the same way, and this check is the only thing
 * stopping one assessor writing papers into another's course — so it is one
 * function rather than six copies that could drift apart.
 */
async function resolveScope(request, response) {
  if (!databaseReady()) {
    serviceUnavailable(response);
    return null;
  }

  const assessor = await findAssessor(request.params.assessorId);
  if (!assessor) {
    response.status(404).json({ message: "Assessor not found." });
    return null;
  }

  const course = await findAssignedCourse(assessor, request.params.courseId);
  if (!course) {
    response.status(404).json({ message: "Course not found for this assessor." });
    return null;
  }

  return { assessor, course };
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
      { projection: { assessmentId: 1 } }
    )
    .toArray();

  results.forEach((result) => {
    const key = asId(result.assessmentId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

/**
 * A row for the generate screen: what exists for this paper and what state it
 * is in, without the questions themselves.
 */
function assessmentRow(doc, submissions = 0) {
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
    // The paper's length and the bank it is drawn from are two different
    // numbers, and the screen has to show both — otherwise the assessor reads
    // "30 questions" for a ten-question quiz.
    itemsPerAttempt: normalized.itemsPerAttempt,
    bankSize: normalized.items.length,
    timeLimitMinutes: normalized.timeLimitMinutes,
    totalPoints: normalized.totalPoints,
    passMark: normalized.passMark,
    generatedAt: doc.source?.generatedAt ?? null,
    submissions
  };
}

/**
 * The whole paper, answer keys included.
 *
 * The opposite of `toStudentAssessment`, and deliberately so: correcting a
 * question means seeing which answer the model marked as right. This is the one
 * place a full bank leaves the server with its keys attached — to the assessor
 * the course is assigned to, and to nobody else.
 */
function assessmentDetail(doc, submissions = 0) {
  const normalized = normalizeAssessment(doc);

  return {
    ...assessmentRow(doc, submissions),
    description: normalized.description,
    // Numbered for the screen. The stored `n` follows the bank as it was
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

  const counts = await submissionCounts(assessments.map((doc) => doc._id));

  const enrolled = (await collectionExists(STUDENTS_COLLECTION))
    ? await collection(STUDENTS_COLLECTION).countDocuments({
        enrolledCourses: { $in: idCandidates(course._id) }
      })
    : 0;

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
      assessment: quiz ? assessmentRow(quiz, counts.get(asId(quiz._id)) ?? 0) : null
    };
  });

  return response.json({
    course: {
      id: asId(course._id),
      code: courseCode(course),
      name: courseTitle(course),
      students: enrolled
    },
    defaultFinalMinutes: DEFAULT_FINAL_MINUTES,
    lessons: rows,
    final: finalDoc ? assessmentRow(finalDoc, counts.get(asId(finalDoc._id)) ?? 0) : null
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

  const counts = await submissionCounts([doc._id]);
  return response.json({ assessment: assessmentDetail(doc, counts.get(asId(doc._id)) ?? 0) });
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
  const scope = await resolveScope(request, response);
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
 * Body: { items?: [{ id, q?, choices?, key?, type? }], timeLimitMinutes?,
 *         itemsPerAttempt? }
 *
 * The correction step: the assessor found a question whose stated answer is
 * wrong, and fixes it.
 *
 * `items` is a patch rather than a replacement. The assessor sends only the
 * questions they changed, keyed by id, and the rest of the bank is left exactly
 * as it was — sending the whole bank back would let a stale screen quietly undo
 * a fix made from another one.
 *
 * An edited item goes through the same normaliser a generated one does, so a
 * key naming no choice is refused here rather than marking a whole class wrong.
 */
export async function updateCourseAssessment(request, response) {
  const scope = await resolveScope(request, response);
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

  if ("itemsPerAttempt" in body) {
    const wanted = Math.floor(Number(body.itemsPerAttempt));
    if (!(wanted > 0) || wanted > items.length) {
      return response.status(400).json({
        message: `An assessment has to be between 1 and ${items.length} questions — that is how many the bank holds.`
      });
    }

    // The three move together, or a shortened paper is still marked out of what
    // the longer one was worth.
    update.itemsPerAttempt = wanted;
    update.totalPoints = wanted * (Number(doc.pointsPerItem) || 1);
    update.passMark = Math.ceil(update.totalPoints * DEFAULT_PASS_RATIO);
  }

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
  const scope = await resolveScope(request, response);
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
