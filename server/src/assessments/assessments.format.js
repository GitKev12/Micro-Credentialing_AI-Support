/**
 * The shape of a quiz, and the rules for reading and scoring one.
 *
 * No quizzes are seeded here. This module defines the format the AI generator
 * writes into the Assessment collection, and the only place that decides what
 * a student is allowed to see of it.
 *
 * ── Assessment document ────────────────────────────────────────────────────
 *   {
 *     _id, courseId,
 *     scope:   "lesson" | "final",
 *     status:  "draft" | "posted",   // only a posted paper reaches a student
 *     moduleId,            // the lesson it tests; null when scope is "final"
 *     title, description,
 *     timeLimitMinutes?,   // how long the sitting runs; null when untimed
 *     credentialName?,     // defaults to "<title> Credential"
 *     pointsPerItem,       // default 1 — see DEFAULT_POINTS_PER_ITEM
 *     itemsPerModule?,     // { <moduleId>: count } — how a final's questions
 *                          // divide between lessons, which is the denominator
 *                          // of each Skill Score. Absent on a lesson quiz.
 *     totalPoints,         // pointsPerItem * items.length
 *     passMark,            // default 60% of totalPoints, rounded up (TSU)
 *     source: {            // which Table of Specification row this came from
 *       tosRow,            // the TOS row's `course` label
 *       level,             // one of the six TOS levels
 *       generatedAt, model
 *     },
 *     items: [ … ]
 *   }
 *
 * ── The paper is its questions ─────────────────────────────────────────────
 * `items` is the paper. Every student sits every question in it, so its length,
 * what it is worth and what passes it are one arithmetic and are derived here
 * rather than stored — a paper cannot be marked out of a number that disagrees
 * with the questions on it.
 *
 * There was a bank: the generator wrote three times what a quiz needed and each
 * student was dealt a subset. It bought variety between students at the cost of
 * a second number on every screen, and it gave a student the same subset on
 * every retake anyway — so a lesson quiz with unlimited retakes never reached
 * the other two thirds. What makes two sittings differ now is the order of the
 * questions and of their choices, which is re-drawn every time the paper is
 * served.
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
 *
 * Both types also carry `moduleId` and `topic`: the lesson the question was
 * written for. A lesson quiz leaves them null, because the assessment itself
 * names the lesson. A final sets them on every item, because a final draws from
 * every lesson at once and skill gap analysis reports one score per lesson —
 * without them a graded final is a single number with no way back to a topic.
 */

import { shuffled } from "../lib/random.js";

export const ITEM_TYPES = ["multiple-choice", "true-false"];

export const TOS_LEVELS = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create"
];

export const TRUE_FALSE_CHOICES = [
  { id: "true", text: "True" },
  { id: "false", text: "False" }
];

/**
 * What one correct answer is worth.
 *
 * One point per item, so a paper's score reads as the number of questions the
 * student actually got right. It was 5, which meant a 60-item final was marked
 * out of 300 and every figure on screen had to be divided by five before it
 * meant anything to anyone.
 *
 * Exported rather than repeated: this used to be written out in three separate
 * files, which is the same way DEFAULT_PASS_RATIO below once ended up meaning
 * three different things. An assessment that carries its own `pointsPerItem`
 * still wins — a stored value is a decision someone made about that paper.
 */
export const DEFAULT_POINTS_PER_ITEM = 1;

/**
 * The passing mark, as a share of an assessment's total points.
 *
 * 60% is TSU's standard passing percentage, set by memorandum — it is a policy
 * figure, not a tuning knob, so it lives here alone and everything that needs
 * it imports it. It used to be written 0.8 in three separate files, which is
 * exactly how a rule ends up meaning three different things.
 *
 * An assessment that carries its own `passMark` still wins: a stored value is
 * a decision someone made about that paper, and this is only the default for
 * papers that never said.
 */
export const DEFAULT_PASS_RATIO = 0.6;

/**
 * What passing this paper is worth, by name.
 *
 * Read in two places that must agree — the submission that earns a credential
 * and the console that issues it — so it is defined once here rather than
 * once on each side, where the two could name the same award differently.
 */
export function credentialNameFor(assessment) {
  if (assessment?.credentialName) return assessment.credentialName;
  return assessment?.title ? `${assessment.title} Credential` : "Course Credential";
}

/** The default pass mark for a paper worth `totalPoints`, rounded up. */
export function defaultPassMark(totalPoints) {
  return Math.ceil(Number(totalPoints || 0) * DEFAULT_PASS_RATIO);
}

/**
 * How long a final examination runs, in minutes.
 *
 * An hour and a half is what the department sets a final at, so it is what the
 * assessor's generator offers before anyone touches it. It is a default and not
 * a rule — the assessor may clear the box and set their own — which is why it
 * lives here as a starting value rather than being enforced anywhere.
 */
export const DEFAULT_FINAL_MINUTES = 90;

/**
 * Whether a paper has been released to the students of its course.
 *
 * Assessments used to appear the moment they were written, because a student
 * pressing "Take the Quiz" was what wrote them. Releasing is now the assessor's
 * act: a generated paper sits as a draft — theirs to read, correct and set the
 * length of — until they post it, and only then does any student see it.
 *
 * Posting is the only thing that writes `status: "posted"`, so a paper that does
 * not say it is posted has not been. An absent status used to read as posted,
 * to keep papers written before this gate existed live — what it did instead
 * was hand students the drafts left over from before the assessor had a say,
 * which is the one thing the gate is here to prevent. Nothing else opens it:
 * a paper nobody posted stays the assessor's, and their console shows it as
 * the draft it is with a Post button beside it.
 */
export function assessmentStatus(doc) {
  return doc?.status === "posted" ? "posted" : "draft";
}

/** Shorthand for the gate the student side asks about. */
export const isPosted = (doc) => assessmentStatus(doc) === "posted";

/**
 * A sitting's clock, in whole minutes, or null for an untimed paper.
 *
 * Null rather than zero: "no limit" and "no time" are opposite answers, and a
 * zero stored by a stray form field must not become the second one.
 */
export function normalizeMinutes(raw) {
  const minutes = Math.floor(Number(raw));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

const text = (value) => String(value ?? "").trim();

/**
 * A question's code sample, with its layout kept.
 *
 * Not `text`: a snippet's indentation and line breaks are part of what the
 * student is reading, and trimming the inside of it would hand them one line of
 * Java to trace. Only what surrounds the code goes — blank lines above and
 * trailing space below — plus the markdown fence a model sometimes wraps it in
 * despite being told not to, which would otherwise be shown as two lines of
 * backticks.
 */
export function normalizeCode(value) {
  const lines = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));

  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  if (lines.length >= 2 && /^```/.test(lines[0].trim()) && /^```$/.test(lines[lines.length - 1].trim())) {
    lines.shift();
    lines.pop();
  }

  return lines.join("\n");
}

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
    // The snippet the question is about — traced for its output, searched for
    // its error, or read for what it does. Null on a question that needs none.
    code: normalizeCode(raw.code) || null,
    choices,
    key,
    // Why the key is the answer, for whoever checks the paper. Staff only: it
    // gives the answer away, so toStudentAssessment removes it with the key.
    explanation: text(raw.explanation) || null,
    level,
    // Where the question came from. Set by the final's assembler; null on a
    // lesson quiz, whose document already says which lesson it tests.
    moduleId: text(raw.moduleId) || null,
    topic: text(raw.topic) || null
  };
}

/**
 * A final's per-lesson quota, cleaned. Null when the paper has none, which is
 * every lesson quiz and any final assembled before quotas existed. It is what
 * each lesson's Skill Score is read out of.
 */
function normalizeModuleQuota(raw) {
  if (!raw || typeof raw !== "object") return null;

  const quota = {};
  for (const [moduleId, value] of Object.entries(raw)) {
    const count = Math.floor(Number(value));
    if (moduleId && count > 0) quota[moduleId] = count;
  }

  return Object.keys(quota).length > 0 ? quota : null;
}

export function normalizeAssessment(doc) {
  if (!doc) return null;

  const items = (Array.isArray(doc.items) ? doc.items : [])
    .map(normalizeItem)
    .filter(Boolean);

  const pointsPerItem = Number(doc.pointsPerItem) > 0
    ? Number(doc.pointsPerItem)
    : DEFAULT_POINTS_PER_ITEM;

  // The paper is its questions. There is no bank to draw a shorter paper from,
  // so its length, what it is worth and what passes it are all one arithmetic
  // from `items` — derived rather than read, so a stored `totalPoints` left
  // over from a document that did hold a bank cannot mark a paper out of five
  // when fifteen questions are being served.
  const totalPoints = pointsPerItem * items.length;

  // "final" when the document says so, or when it belongs to no single lesson.
  const moduleId = doc.moduleId ?? doc.module_id ?? null;
  const scope = doc.scope === "final" || !moduleId ? "final" : "lesson";

  return {
    id: String(doc._id),
    courseId: doc.courseId ?? null,
    moduleId: scope === "final" ? null : moduleId,
    scope,
    status: assessmentStatus(doc),
    postedAt: doc.postedAt ?? null,
    timeLimitMinutes: normalizeMinutes(doc.timeLimitMinutes),
    title: text(doc.title ?? doc.name),
    description: text(doc.description),
    pointsPerItem,
    itemCount: items.length,
    // A final still records how its questions divide between the lessons: that
    // is the denominator every Skill Score is read against, and it survives the
    // bank it used to be a drawing quota for.
    itemsPerModule: normalizeModuleQuota(doc.itemsPerModule),
    topics: Array.isArray(doc.topics) ? doc.topics : null,
    totalPoints,
    passMark: defaultPassMark(totalPoints),
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
 *
 * Every student sits every question: the paper is its item list, and what makes
 * two sittings differ is the order, not the questions. Order is re-drawn on
 * every call, questions and choices both. It is free, and it cannot affect the
 * mark because answers come back keyed by item id. Note the choices are
 * shuffled *after* normalizeItem has assigned their ids — shuffling raw choices
 * would hand the id of the right answer to whichever option happened to land in
 * its place.
 */
export function toStudentAssessment(doc, { shuffle = true } = {}) {
  const assessment = normalizeAssessment(doc);
  if (!assessment) return null;

  const { items, itemsPerModule: _quota, topics: _topics, ...rest } = assessment;
  const ordered = shuffle ? shuffled(items) : items;

  return {
    ...rest,
    itemCount: ordered.length,
    // `moduleId` and `topic` go the same way as the key: they are how the paper
    // is scored, not part of the question. Sitting the exam does not need to
    // know which lesson each item came from, and the mark does not depend on it.
    // The explanation goes because it names the answer.
    items: ordered.map(
      ({ key: _key, explanation: _explanation, moduleId: _moduleId, topic: _topic, ...item }) => ({
        ...item,
        choices: shuffle ? shuffled(item.choices) : item.choices
      })
    )
  };
}

/**
 * The list-row form: enough to render a rail entry, without the questions.
 * `itemCount` is the length of the paper, not of the bank behind it.
 */
export function toAssessmentSummary(doc) {
  const assessment = normalizeAssessment(doc);
  if (!assessment) return null;

  // The quota and the topic list are how a final is built and scored, not part
  // of a rail row — the rail only needs to say how long the paper is.
  const { items: _items, itemsPerModule: _quota, topics: _topics, ...rest } = assessment;
  return { ...rest, itemCount: assessment.itemCount };
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

  // The paper, read from the document rather than from the submission. A client
  // that could name its own questions could name the five it liked the look of
  // and leave the rest unmarked.
  const served = assessment.items;

  const chosenByItem = new Map(
    (Array.isArray(answers) ? answers : []).map((answer) => [
      String(answer?.itemId),
      text(answer?.choice).toLowerCase()
    ])
  );

  const items = served.map((item) => {
    const chosen = chosenByItem.get(String(item.id)) ?? "";
    return {
      itemId: item.id,
      verdict: chosen === item.key ? "correct" : "incorrect",
      chosen: chosen || null,
      // Carried onto the result so a final can be scored per lesson without
      // re-opening the assessment and matching item ids back to it. Null on a
      // lesson quiz, where the result already names its module.
      moduleId: item.moduleId ?? null,
      topic: item.topic ?? null
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
    passed: score >= assessment.passMark,
    // Recorded on the submission so a result still says which questions it
    // answered even after the paper behind it is regenerated.
    servedItemIds: served.map((item) => item.id)
  };
}

/**
 * A handed-in paper as staff read it: every question, the key, and what the
 * student put down against it.
 *
 * The opposite end of `toStudentAssessment`, which strips the key because the
 * person reading it is taking the paper. Here the person reading it wrote the
 * paper, and the key is most of the point — an assessor looking at a question
 * the whole class got wrong is deciding whether the class missed it or the
 * question is broken, and they cannot decide that without seeing the answer
 * they were marked against.
 *
 * Verdicts are read off the submission, never recomputed. The mark was made at
 * hand-in and it is final (see assessors/grading.js), so a screen that worked
 * out its own verdict could show a student a different result from the one
 * they were given — if the paper were edited afterwards, it certainly would.
 * The comparison against the key is a fallback for submissions stored before
 * per-item verdicts were kept, and nothing else.
 */
export function toMarkedPaper(assessmentDoc, result) {
  const assessment = normalizeAssessment(assessmentDoc);
  if (!assessment) return null;

  const marks = new Map(
    (Array.isArray(result?.aiGrading?.items) ? result.aiGrading.items : []).map((mark) => [
      String(mark?.itemId),
      mark
    ])
  );
  // Older submissions kept only what was sent, with no per-item mark beside it.
  const sent = new Map(
    (Array.isArray(result?.answers) ? result.answers : []).map((answer) => [
      String(answer?.itemId),
      text(answer?.choice).toLowerCase()
    ])
  );

  const items = assessment.items.map((item) => {
    const mark = marks.get(String(item.id)) ?? null;
    const chosen = mark ? (mark.chosen ?? null) : (sent.get(String(item.id)) || null);

    return {
      id: item.id,
      n: item.n,
      type: item.type,
      q: item.q,
      code: item.code,
      level: item.level,
      topic: item.topic,
      moduleId: item.moduleId,
      choices: item.choices,
      key: item.key,
      explanation: item.explanation,
      chosen,
      // Blank is not the same as wrong, even though both score nothing: one
      // says the student did not know, the other that they ran out of time.
      answered: chosen != null,
      verdict: mark?.verdict ?? (chosen === item.key ? "correct" : "incorrect")
    };
  });

  /*
   * Questions this student answered that are no longer on the paper.
   *
   * Regenerating replaces the items wholesale, so a submission from before it
   * is marked against questions that have gone. The mark stands — it was made
   * against the paper as served — but the screen can only show what is still
   * there, and it has to say so rather than quietly showing a shorter paper.
   */
  const served = Array.isArray(result?.aiGrading?.servedItemIds)
    ? result.aiGrading.servedItemIds.map(String)
    : [];
  const onPaper = new Set(assessment.items.map((item) => String(item.id)));
  const missing = served.filter((id) => !onPaper.has(id)).length;

  return {
    itemCount: items.length,
    answered: items.filter((item) => item.answered).length,
    correct: items.filter((item) => item.verdict === "correct").length,
    missing,
    items
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

  // A paper with nothing left on it is worth catching here rather than letting
  // an empty quiz reach a class: normalizeAssessment would report it as zero
  // questions worth zero points, which is a valid document and a useless paper.
  const usable = raw.map(normalizeItem).filter(Boolean).length;
  if (usable === 0) {
    problems.push("no item survived normalisation, so the paper has no questions.");
  }

  return { valid: problems.length === 0, problems };
}
