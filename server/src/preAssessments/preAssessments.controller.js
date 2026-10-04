import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { classHolding, loadStudentRestriction, refuseRestrictedCourse } from "../lib/courseAccess.js";
import { isAssessOnly } from "../lib/classMode.js";
import { lessonLockFor } from "../lib/lessonLocks.js";

/**
 * Pre-Assessments: 1–5 questions a student answers once before a lesson opens.
 *
 * Not graded and gives no badge. It only tells the student what they already
 * know. Only the student sees their result.
 *
 * PreAssessment          { _id, moduleId, courseId, courseCode, active, items, createdAt, updatedAt }
 * PreAssessmentAttempt   { _id, preAssessmentId, moduleId, courseId, studentId,
 *                          items (copy at the time), answers, score, total, submittedAt }
 *
 * Items use the quiz shape: { id, type, q, choices: [{ id, text }], key, explanation }.
 * A true/false item gets the two fixed choices "true" and "false".
 */

const PRE_COLLECTION = "PreAssessment";
const ATTEMPTS_COLLECTION = "PreAssessmentAttempt";
const MODULES_COLLECTION = "LearningModule";
const COURSES_COLLECTION = "Course";

export const MAX_PRE_ITEMS = 5;
// Longest question, choice and explanation, in characters.
const MAX_QUESTION = 500;
const MAX_CHOICE = 200;
const MAX_EXPLANATION = 1000;
const TYPES = ["multiple-choice", "true-false"];
const TRUE_FALSE = [
  { id: "true", text: "True" },
  { id: "false", text: "False" }
];

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

/* ─────────────────────────── Items ─────────────────────────── */

/**
 * Checks the admin's questions and returns them cleaned, or an error message.
 * Each item: { type, q, choices?, key, explanation? }.
 */
export function cleanItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Add at least one question." };
  }
  if (items.length > MAX_PRE_ITEMS) {
    return { error: `A pre-assessment has at most ${MAX_PRE_ITEMS} questions.` };
  }

  const cleaned = [];
  for (const [index, item] of items.entries()) {
    const label = `Question ${index + 1}`;
    const type = TYPES.includes(item?.type) ? item.type : null;
    const q = String(item?.q ?? "").trim();
    if (!type) return { error: `${label}: choose multiple choice or true/false.` };
    if (!q) return { error: `${label}: write the question.` };
    if (q.length > MAX_QUESTION) return { error: `${label}: the question can be at most ${MAX_QUESTION} characters.` };

    let choices = TRUE_FALSE;
    if (type === "multiple-choice") {
      choices = (Array.isArray(item.choices) ? item.choices : [])
        .map((choice, at) => ({
          id: String.fromCharCode(97 + at), // a, b, c…
          text: String(choice?.text ?? "").trim()
        }))
        .filter((choice) => choice.text);
      // Re-letter after dropping blanks, so the ids stay a, b, c….
      choices = choices.map((choice, at) => ({ ...choice, id: String.fromCharCode(97 + at) }));
      if (choices.length < 2 || choices.length > 6) {
        return { error: `${label}: give 2 to 6 choices.` };
      }
      if (choices.some((choice) => choice.text.length > MAX_CHOICE)) {
        return { error: `${label}: each choice can be at most ${MAX_CHOICE} characters.` };
      }
    }

    const explanation = String(item?.explanation ?? "").trim();
    if (explanation.length > MAX_EXPLANATION) {
      return { error: `${label}: the explanation can be at most ${MAX_EXPLANATION} characters.` };
    }

    const key = String(item?.key ?? "");
    if (!choices.some((choice) => choice.id === key)) {
      return { error: `${label}: mark the correct answer.` };
    }

    cleaned.push({
      id: `p${index + 1}`,
      type,
      q,
      choices,
      key,
      explanation
    });
  }

  return { items: cleaned };
}

/** Admin's multiple-choice choices are sent by text; key is the letter. Same shape back. */
function adminView(doc) {
  if (!doc) return null;
  return {
    id: asId(doc._id),
    moduleId: asId(doc.moduleId),
    active: doc.active === true,
    items: doc.items ?? [],
    updatedAt: doc.updatedAt ?? null
  };
}

/** What a student sees before answering: no key, no explanation. */
function questionsOnly(items) {
  return (items ?? []).map(({ key: _key, explanation: _explanation, ...item }) => item);
}

/** Marks the answers. `answers` is { [itemId]: choiceId }. */
export function scoreAnswers(items, answers) {
  const given = answers && typeof answers === "object" ? answers : {};
  const score = items.filter((item) => String(given[item.id] ?? "") === item.key).length;
  return { score, total: items.length };
}

/* ─────────────────────────── Admin ─────────────────────────── */

async function findModule(moduleId) {
  return collection(MODULES_COLLECTION).findOne({ _id: { $in: idCandidates(moduleId) } });
}

/** GET /api/admin/modules/:moduleId/pre-assessment */
export async function getModulePreAssessment(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const module = await findModule(request.params.moduleId);
  if (!module) return response.status(404).json({ message: "Module not found." });

  const course = module.courseId
    ? await collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(module.courseId) } })
    : null;
  const doc = (await collectionExists(PRE_COLLECTION))
    ? await collection(PRE_COLLECTION).findOne({ moduleId: { $in: idCandidates(module._id) } })
    : null;

  return response.json({
    module: {
      id: asId(module._id),
      title: module.title ?? module.fileName ?? "Untitled module",
      courseId: module.courseId ? asId(module.courseId) : null,
      courseTitle: course?.title ?? course?.courseName ?? "",
      courseCode: (course?.courseCode ?? course?.code ?? module.courseCode ?? "").trim()
    },
    preAssessment: adminView(doc)
  });
}

/**
 * PUT /api/admin/modules/:moduleId/pre-assessment
 * Body: { items, active }. Creates or replaces the lesson's pre-assessment.
 * Attempts already taken keep their own copy of the questions.
 */
export async function saveModulePreAssessment(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const module = await findModule(request.params.moduleId);
  if (!module) return response.status(404).json({ message: "Module not found." });

  const checked = cleanItems(request.body?.items);
  if (checked.error) return response.status(400).json({ message: checked.error });

  const now = new Date();
  const fields = {
    items: checked.items,
    active: request.body?.active === true,
    courseId: module.courseId ?? null,
    courseCode: module.courseCode ?? "",
    updatedAt: now
  };

  const existing = await collection(PRE_COLLECTION).findOne({
    moduleId: { $in: idCandidates(module._id) }
  });

  if (existing) {
    await collection(PRE_COLLECTION).updateOne({ _id: existing._id }, { $set: fields });
    return response.json({ preAssessment: adminView({ ...existing, ...fields }) });
  }

  const document = { ...fields, moduleId: module._id, createdAt: now };
  const { insertedId } = await collection(PRE_COLLECTION).insertOne(document);
  return response.status(201).json({ preAssessment: adminView({ ...document, _id: insertedId }) });
}

/** DELETE /api/admin/modules/:moduleId/pre-assessment — and the attempts at it. */
export async function deleteModulePreAssessment(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const module = await findModule(request.params.moduleId);
  if (!module) return response.status(404).json({ message: "Module not found." });

  const removed = await removePreAssessmentsFor(module._id);
  if (!removed) return response.status(404).json({ message: "This lesson has no pre-assessment." });

  return response.json({ removed: true });
}

/** Deletes a lesson's pre-assessment and its attempts. Used when a lesson is deleted too. */
export async function removePreAssessmentsFor(moduleId) {
  if (!(await collectionExists(PRE_COLLECTION))) return 0;
  const byModule = { moduleId: { $in: idCandidates(moduleId) } };
  const { deletedCount } = await collection(PRE_COLLECTION).deleteMany(byModule);
  if (await collectionExists(ATTEMPTS_COLLECTION)) {
    await collection(ATTEMPTS_COLLECTION).deleteMany(byModule);
  }
  return deletedCount ?? 0;
}

/** For the admin's lesson list: { moduleId → { active, count } }. */
export async function preAssessmentSummaries(moduleIds) {
  if (!moduleIds.length || !(await collectionExists(PRE_COLLECTION))) return new Map();
  const docs = await collection(PRE_COLLECTION)
    .find({ moduleId: { $in: moduleIds.flatMap((id) => idCandidates(id)) } })
    .project({ moduleId: 1, active: 1, items: 1 })
    .toArray();
  return new Map(
    docs.map((doc) => [asId(doc.moduleId), { active: doc.active === true, count: (doc.items ?? []).length }])
  );
}

/* ─────────────────────────── Student ─────────────────────────── */

/** The student's own attempt, shown with the answers once it is done. */
function attemptView(attempt) {
  if (!attempt) return null;
  return {
    score: attempt.score,
    total: attempt.total,
    answers: attempt.answers ?? {},
    items: attempt.items ?? [],
    submittedAt: attempt.submittedAt ?? null
  };
}

/** Whether this student can take pre-assessments in this course: in a class, not assess-only. */
async function studentCanTake(studentId, courseId) {
  const held = await classHolding(studentId, courseId);
  return Boolean(held) && !isAssessOnly(held);
}

/**
 * GET /api/students/:studentId/courses/:courseId/pre-assessments
 * The course's switched-on pre-assessments, each with this student's attempt.
 */
export async function getCoursePreAssessments(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { studentId, courseId } = request.params;
  if (!(await collectionExists(PRE_COLLECTION))) return response.json({ preAssessments: [] });
  if (!(await studentCanTake(studentId, courseId))) return response.json({ preAssessments: [] });

  const docs = await collection(PRE_COLLECTION)
    .find({ courseId: { $in: idCandidates(courseId) }, active: true })
    .toArray();
  if (docs.length === 0) return response.json({ preAssessments: [] });

  const attempts = (await collectionExists(ATTEMPTS_COLLECTION))
    ? await collection(ATTEMPTS_COLLECTION)
        .find({
          studentId: { $in: idCandidates(studentId) },
          preAssessmentId: { $in: docs.map((doc) => doc._id) }
        })
        .toArray()
    : [];
  const attemptFor = new Map(attempts.map((attempt) => [asId(attempt.preAssessmentId), attempt]));

  return response.json({
    preAssessments: docs.map((doc) => ({
      id: asId(doc._id),
      moduleId: asId(doc.moduleId),
      items: questionsOnly(doc.items),
      attempt: attemptView(attemptFor.get(asId(doc._id)))
    }))
  });
}

/**
 * POST /api/students/:studentId/pre-assessments/:preAssessmentId/submit
 * Body: { answers: { [itemId]: choiceId } }. One attempt per student.
 */
export async function submitPreAssessment(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const { studentId, preAssessmentId } = request.params;
  const answers = request.body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return response.status(400).json({ message: "answers must be an object." });
  }

  const doc = await collection(PRE_COLLECTION).findOne({
    _id: { $in: idCandidates(preAssessmentId) },
    active: true
  });
  if (!doc) return response.status(404).json({ message: "Pre-assessment not found." });

  if (!(await studentCanTake(studentId, doc.courseId))) {
    return response.status(404).json({ message: "Pre-assessment not found." });
  }

  const restriction = await loadStudentRestriction(studentId, doc.courseId);
  if (restriction) return refuseRestrictedCourse(response, restriction);

  // Its lesson must be open: the previous lesson's exam passed.
  const module = await collection(MODULES_COLLECTION).findOne({ _id: { $in: idCandidates(doc.moduleId) } });
  const lockReason = module ? await lessonLockFor(studentId, module) : null;
  if (lockReason) return response.status(423).json({ message: lockReason, locked: true });

  const taken = await collection(ATTEMPTS_COLLECTION).findOne({
    studentId: { $in: idCandidates(studentId) },
    preAssessmentId: doc._id
  });
  if (taken) {
    return response.status(409).json({
      message: "You have already taken this pre-assessment.",
      attempt: attemptView(taken)
    });
  }

  // Only answers to this pre-assessment's own questions are kept.
  const kept = Object.fromEntries(
    doc.items.filter((item) => answers[item.id] !== undefined).map((item) => [item.id, String(answers[item.id])])
  );
  const { score, total } = scoreAnswers(doc.items, kept);

  const attempt = {
    preAssessmentId: doc._id,
    moduleId: doc.moduleId,
    courseId: doc.courseId,
    studentId,
    items: doc.items,
    answers: kept,
    score,
    total,
    submittedAt: new Date()
  };
  await collection(ATTEMPTS_COLLECTION).insertOne(attempt);

  return response.status(201).json({ attempt: attemptView(attempt) });
}

/* ─────────────────────────── Progress ─────────────────────────── */

/**
 * How many switched-on Pre-Assessments each course has, and how many of them
 * each student has taken — for the course progress sum.
 *
 * Returns a lookup: (studentId, courseId) → { total, done }.
 */
export async function loadPreProgress(studentIds, courseIds) {
  const none = () => ({ total: 0, done: 0 });
  if (!courseIds.length || !(await collectionExists(PRE_COLLECTION))) return none;

  const docs = await collection(PRE_COLLECTION)
    .find({ courseId: { $in: courseIds.flatMap((id) => idCandidates(id)) }, active: true })
    .project({ courseId: 1 })
    .toArray();
  if (docs.length === 0) return none;

  const totalByCourse = new Map();
  const courseByPre = new Map();
  docs.forEach((doc) => {
    const course = asId(doc.courseId);
    totalByCourse.set(course, (totalByCourse.get(course) ?? 0) + 1);
    courseByPre.set(asId(doc._id), course);
  });

  const attempts = (await collectionExists(ATTEMPTS_COLLECTION))
    ? await collection(ATTEMPTS_COLLECTION)
        .find({
          studentId: { $in: studentIds.flatMap((id) => idCandidates(id)) },
          preAssessmentId: { $in: docs.map((doc) => doc._id) }
        })
        .project({ studentId: 1, preAssessmentId: 1 })
        .toArray()
    : [];

  // "student|course" → how many taken.
  const doneBy = new Map();
  attempts.forEach((attempt) => {
    const key = `${asId(attempt.studentId)}|${courseByPre.get(asId(attempt.preAssessmentId))}`;
    doneBy.set(key, (doneBy.get(key) ?? 0) + 1);
  });

  // A student may be known by more than one id spelling, so each is tried.
  return (studentId, courseId, ...otherIds) => {
    const course = asId(courseId);
    const done = [studentId, ...otherIds]
      .filter(Boolean)
      .reduce((most, id) => Math.max(most, doneBy.get(`${asId(id)}|${course}`) ?? 0), 0);
    return { total: totalByCourse.get(course) ?? 0, done };
  };
}
