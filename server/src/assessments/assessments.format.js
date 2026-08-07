/**
 * The shape of a quiz, and the rules for reading and scoring one.
 *
 * No quizzes are seeded here. This module defines the format the AI generator
 * will write into the Assessment collection, and the only place that decides
 * what a student is allowed to see of it.
 *
 * ── Assessment document ────────────────────────────────────────────────────
 *   {
 *     _id, courseId,
 *     scope:   "lesson" | "final",
 *     moduleId,            // the lesson it tests; null when scope is "final"
 *     title, description,
 *     credentialName?,     // defaults to "<title> Credential"
 *     pointsPerItem,       // default 5, matching reviewConfig in assessors
 *     totalPoints,         // default pointsPerItem * items.length
 *     passMark,            // default 80% of totalPoints, rounded up
 *     source: {            // which Table of Specification row this came from
 *       tosRow,            // the TOS row's `course` label
 *       level,             // one of the six TOS levels
 *       generatedAt, model
 *     },
 *     items: [ … ]
 *   }
 *
 * ── Items ──────────────────────────────────────────────────────────────────
 * Two types, because those are the two the generator produces from a TOS row:
 *
 *   multiple-choice
 *     { id, n, type: "multiple-choice", q, choices: [{ id, text }], key }
 *     `key` is the id of the correct choice.
 *
 *   true-false
 *     { id, n, type: "true-false", q, key }
 *     `key` is a boolean.
 *
 * A true-false item is normalised into the same `choices` + string `key` form
 * as a multiple-choice one. Grading, the answer payload and the UI then have a
 * single shape to handle, and "true/false" stays a property of the item rather
 * than a second code path through everything that touches a quiz.
 */

export const ITEM_TYPES = ["multiple-choice", "true-false"];

export const TOS_LEVELS = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create"
];

const TRUE_FALSE_CHOICES = [
  { id: "true", text: "True" },
  { id: "false", text: "False" }
];

const DEFAULT_POINTS_PER_ITEM = 5;
const DEFAULT_PASS_RATIO = 0.8;

const text = (value) => String(value ?? "").trim();

/** True-false keys arrive as booleans, or as the strings a form would send. */
function normalizeTrueFalseKey(key) {
  if (typeof key === "boolean") return key ? "true" : "false";
  const cleaned = text(key).toLowerCase();
  if (["true", "t", "yes"].includes(cleaned)) return "true";
  if (["false", "f", "no"].includes(cleaned)) return "false";
  return "";
}

function normalizeChoices(item) {
  if (item.type === "true-false") return TRUE_FALSE_CHOICES;

  return (Array.isArray(item.choices) ? item.choices : []).map((choice, index) => {
    // Choices may be plain strings — letter them a, b, c so every item has
    // stable ids to answer against.
    const fallbackId = String.fromCharCode(97 + index);
    if (choice && typeof choice === "object") {
      return { id: text(choice.id) || fallbackId, text: text(choice.text ?? choice.label) };
    }
    return { id: fallbackId, text: text(choice) };
  });
}

/**
 * One item in canonical form. Returns null for anything unusable, so a single
 * malformed question from the generator drops out instead of breaking the quiz.
 */
export function normalizeItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const type = ITEM_TYPES.includes(raw.type) ? raw.type : "multiple-choice";
  const question = text(raw.q ?? raw.question);
  if (!question) return null;

  const choices = normalizeChoices({ ...raw, type });
  if (choices.length < 2) return null;

  const key =
    type === "true-false" ? normalizeTrueFalseKey(raw.key) : text(raw.key).toLowerCase();

  // A key naming no real choice would mark every answer wrong, which is worse
  // than leaving the item out.
  if (!choices.some((choice) => choice.id === key)) return null;

  const level = TOS_LEVELS.includes(raw.level) ? raw.level : null;

  return {
    id: text(raw.id) || String(index + 1),
    n: Number.isFinite(raw.n) ? raw.n : index + 1,
    type,
    q: question,
    choices,
    key,
    level
  };
}

export function normalizeAssessment(doc) {
  if (!doc) return null;

  const items = (Array.isArray(doc.items) ? doc.items : [])
    .map(normalizeItem)
    .filter(Boolean);

  const pointsPerItem = Number(doc.pointsPerItem) > 0
    ? Number(doc.pointsPerItem)
    : DEFAULT_POINTS_PER_ITEM;
  const totalPoints = Number(doc.totalPoints) > 0
    ? Number(doc.totalPoints)
    : pointsPerItem * items.length;

  // "final" when the document says so, or when it belongs to no single lesson.
  const moduleId = doc.moduleId ?? doc.module_id ?? null;
  const scope = doc.scope === "final" || !moduleId ? "final" : "lesson";

  return {
    id: String(doc._id),
    courseId: doc.courseId ?? null,
    moduleId: scope === "final" ? null : moduleId,
    scope,
    title: text(doc.title ?? doc.name),
    description: text(doc.description),
    pointsPerItem,
    totalPoints,
    passMark: Number(doc.passMark) > 0
      ? Number(doc.passMark)
      : Math.ceil(totalPoints * DEFAULT_PASS_RATIO),
    source: doc.source ?? null,
    items
  };
}

/**
 * What the student is allowed to receive.
 *
 * `key` is removed here and nowhere else — this is the boundary. Sending the
 * answer key to the browser would make every quiz self-solving, so no route
 * may serve a raw Assessment document.
 */
export function toStudentAssessment(doc) {
  const assessment = normalizeAssessment(doc);
  if (!assessment) return null;

  const { items, ...rest } = assessment;

  return {
    ...rest,
    itemCount: items.length,
    items: items.map(({ key: _key, ...item }) => item)
  };
}

/** The list-row form: enough to render a rail entry, without the questions. */
export function toAssessmentSummary(doc) {
  const assessment = normalizeAssessment(doc);
  if (!assessment) return null;

  const { items, ...rest } = assessment;
  return { ...rest, itemCount: items.length };
}

/**
 * Scores a submission.
 *
 * Multiple-choice and true-false both compare exactly against the key, so this
 * needs no AI — the generator is what uses the model, not the marking. Results
 * are still written in the `aiGrading` shape the assessor console already
 * reads, with `source: "auto"` recording that a rule marked it, not a model.
 */
export function gradeSubmission(assessmentDoc, answers) {
  const assessment = normalizeAssessment(assessmentDoc);
  const chosenByItem = new Map(
    (Array.isArray(answers) ? answers : []).map((answer) => [
      String(answer?.itemId),
      text(answer?.choice).toLowerCase()
    ])
  );

  const items = assessment.items.map((item) => {
    const chosen = chosenByItem.get(String(item.id)) ?? "";
    return {
      itemId: item.id,
      verdict: chosen === item.key ? "correct" : "incorrect",
      chosen: chosen || null
    };
  });

  const correct = items.filter((item) => item.verdict === "correct").length;
  const score = correct * assessment.pointsPerItem;

  return {
    items,
    correct,
    score,
    total: assessment.totalPoints,
    passMark: assessment.passMark,
    passed: score >= assessment.passMark
  };
}

/**
 * Checks a generated quiz before it is stored. The AI generator is the caller
 * this exists for — it reports what was wrong rather than throwing, so a bad
 * generation can be retried against the specific complaint.
 */
export function validateAssessment(doc) {
  const problems = [];

  if (!doc || typeof doc !== "object") {
    return { valid: false, problems: ["Assessment must be an object."] };
  }
  if (!text(doc.title)) problems.push("title is required.");
  if (!doc.courseId) problems.push("courseId is required.");
  if (doc.scope !== "final" && !(doc.moduleId ?? doc.module_id)) {
    problems.push("a lesson quiz needs a moduleId.");
  }

  const raw = Array.isArray(doc.items) ? doc.items : [];
  if (raw.length === 0) problems.push("items must contain at least one question.");

  raw.forEach((item, index) => {
    if (!normalizeItem(item, index)) {
      problems.push(`item ${index + 1} is unusable (missing question, choices, or a key that matches a choice).`);
    }
  });

  return { valid: problems.length === 0, problems };
}
