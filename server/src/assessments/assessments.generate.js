import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { hashSeed, sample, seededRandom } from "../lib/random.js";
import { loadLessonBlueprint, loadQuizBlueprint } from "./assessments.blueprint.js";
import { ITEM_TYPES, TOS_LEVELS, normalizeItem, validateAssessment } from "./assessments.format.js";
import { generateAssessmentItems } from "../integrations/openai/openai.client.js";
import { recordApiUsage } from "../integrations/openai/usage.log.js";
// The same cleaner the lesson reader uses, so the model reads what the student
// reads rather than the raw PDF behind it.
import { buildLessonBlocks } from "../modules/modules.format.js";
import { stripStyleMarkers } from "../modules/modules.ocr.js";

/**
 * Writing quizzes into the Assessment collection.
 *
 * ── What this costs, and why it is shaped this way ─────────────────────────
 * Generating is a one-off authoring job, not something a student request ever
 * triggers a second time. A lesson's quiz is written once and then read by
 * every student in the course, because an Assessment is keyed by course and
 * module and holds no student. That is the whole cost control: 68 lessons plus
 * 6 finals is the most that can ever be generated, however often anyone asks.
 *
 * Two rules keep it that way, and both are enforced below rather than trusted:
 *   - nothing is generated for a lesson that already has a quiz;
 *   - nothing is generated for a lesson with no extracted text, because the
 *     model would be reading an empty page and the questions it invented would
 *     fail validation anyway — after being paid for.
 *
 * ── Banks ──────────────────────────────────────────────────────────────────
 * The Table of Specification says how many questions a lesson's quiz needs.
 * We ask for several times that many in one call, because the expensive half
 * of the call is the model reading the lesson, and it reads it once whether it
 * then writes eight questions or twenty-four. The surplus is what lets every
 * student sit a different paper without ever calling the model again.
 */

const ASSESSMENTS_COLLECTION = "Assessment";
const MODULES_COLLECTION = "LearningModule";
const COURSES_COLLECTION = "Course";
const TEXT_COLLECTION = "ModuleText";

const DEFAULT_BANK_MULTIPLIER = 3;
const DEFAULT_POINTS_PER_ITEM = 5;
const DEFAULT_PASS_RATIO = 0.8;

// Roughly four characters to a token. Only used to report an estimate before
// spending, so it does not need to be exact.
const CHARS_PER_TOKEN = 4;

// How much lesson text one call may carry. Long enough for a full lecture
// module, short enough that a 200-page outlier cannot quietly cost ten times
// what its neighbours did.
const MAX_SOURCE_CHARS = 40000;

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);
const letterId = (index) => String.fromCharCode(97 + index);

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

/* ───────────────────────── Turning a reply into items ───────────────────────── */

/**
 * The model's output in the shape normalizeItem accepts.
 *
 * Pure, and deliberately so: it is the part of the pipeline most likely to be
 * wrong, and the only part that can be checked without spending anything.
 *
 * The model answers with an index into `choices` rather than a letter or a
 * repeat of the answer text. An index is either in range or it is not, which
 * makes "the model picked an answer that isn't one of the options" a thing we
 * detect here instead of a question that silently marks everyone wrong.
 */
export function mapGeneratedItems(rawItems) {
  const mapped = [];

  (Array.isArray(rawItems) ? rawItems : []).forEach((raw, index) => {
    const question = String(raw?.question ?? raw?.q ?? "").trim();
    const choices = (Array.isArray(raw?.choices) ? raw.choices : []).map((choice) =>
      String(choice ?? "").trim()
    );
    const answerIndex = Number(raw?.answerIndex);
    const type = ITEM_TYPES.includes(raw?.type) ? raw.type : "multiple-choice";

    if (!question) return;
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) return;

    const item = {
      id: `g${index + 1}`,
      n: index + 1,
      type,
      q: question,
      level: TOS_LEVELS.includes(raw?.level) ? raw.level : null
    };

    if (type === "true-false") {
      // Read the answer's own text rather than trusting the order the model
      // listed True and False in.
      const chosen = choices[answerIndex].toLowerCase();
      item.key = chosen.startsWith("t") ? true : chosen.startsWith("f") ? false : answerIndex === 0;
    } else {
      if (choices.length < 2) return;
      item.choices = choices.map((text, position) => ({ id: letterId(position), text }));
      item.key = letterId(answerIndex);
    }

    // Last gate: if the shared normaliser will not take it, it is not an item.
    if (normalizeItem(item, index)) mapped.push(item);
  });

  // Renumber so the stored bank reads 1..n even where the model's output had
  // gaps we dropped.
  return mapped.map((item, index) => ({ ...item, id: `g${index + 1}`, n: index + 1 }));
}

/* ───────────────────────── Source material ───────────────────────── */

const PAGE_MARKER = /^\s*\d+\s*\/\s*\d+\s*$/;

/**
 * The reader's blocks flattened back to plain text.
 *
 * Headings keep a blank line before them so the model can see where one part of
 * the lesson ends and the next begins; lists keep their bullets, because "these
 * are four separate things" is information a question can be built on. The
 * inline italic markers the extractor leaves behind are dropped — they mean
 * something to the client's renderer and nothing to a model.
 */
function blocksToText(blocks) {
  const lines = [];

  for (const block of blocks) {
    if (block.type === "heading") lines.push(`\n${stripStyleMarkers(block.text ?? "")}`);
    else if (block.type === "paragraph" || block.type === "code") {
      lines.push(stripStyleMarkers(block.text ?? ""));
    } else if (block.type === "term") {
      lines.push(`${stripStyleMarkers(block.term ?? "")} — ${stripStyleMarkers(block.text ?? "")}`);
    } else if (block.type === "list") {
      (block.items ?? []).forEach((item) => lines.push(`- ${stripStyleMarkers(item)}`));
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The old behaviour: raw pages with the "3/22" page markers taken out. */
function rawPageText(pages) {
  return pages
    .map((page) =>
      String(page?.text ?? "")
        .split("\n")
        .filter((line) => !PAGE_MARKER.test(line))
        .join("\n")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The lesson the model is asked to write questions from — the same text the
 * student reads, not the raw PDF dump.
 *
 * This used to strip page markers and nothing else, so every call also sent the
 * module's cover page, the developers' names and email addresses, and the course
 * outline. That is material the prompt then invites questions about, since it
 * says every question must be answerable from the lesson text alone; and on the
 * longest lessons it was consuming the character budget that real content
 * needed. `buildLessonBlocks` already removes exactly this — it is what the
 * lesson reader shows a student — so the generator now reads through it.
 *
 * Falls back to the raw text if the formatter yields nothing. A lesson whose
 * layout defeats the heuristics is still worth a quiz, and the old behaviour is
 * a worse source rather than a broken one.
 */
export function toSourceText(textRecord, maxChars = MAX_SOURCE_CHARS) {
  const pages = Array.isArray(textRecord?.pages) ? textRecord.pages : [];
  if (pages.length === 0) return "";

  let body = "";
  try {
    body = blocksToText(buildLessonBlocks(pages));
  } catch (_error) {
    // A formatter that throws on an odd module must not stop its quiz.
    body = "";
  }

  if (body.length < 200) body = rawPageText(pages);

  return body.length > maxChars ? body.slice(0, maxChars) : body;
}

async function loadModuleText(moduleId) {
  if (!(await collectionExists(TEXT_COLLECTION))) return null;
  return collection(TEXT_COLLECTION).findOne({ moduleId: { $in: idCandidates(moduleId) } });
}

/* ───────────────────────── Building the document ───────────────────────── */

/**
 * Totals are written onto the document rather than left to be inferred. The
 * assessor console reads them straight off it, and "how many points is this
 * paper worth" must not depend on whoever is counting.
 */
export function buildAssessmentDocument({
  course,
  module: lesson,
  blueprintRow,
  items,
  itemsPerAttempt,
  scope = "lesson",
  model = null,
  usage = null
}) {
  const pointsPerItem = DEFAULT_POINTS_PER_ITEM;
  const perAttempt = Math.max(1, Math.min(itemsPerAttempt, items.length));
  const totalPoints = pointsPerItem * perAttempt;

  const title =
    scope === "final"
      ? `${course?.courseCode ?? course?.title ?? "Course"} Final Assessment`
      : (lesson?.title ?? blueprintRow?.coverage ?? "Lesson Quiz");

  return {
    courseId: course?._id ?? null,
    moduleId: scope === "final" ? null : (lesson?._id ?? null),
    scope,
    title,
    description:
      scope === "final"
        ? "Covers every lesson in the course."
        : `Covers ${blueprintRow?.coverage ?? lesson?.title ?? "this lesson"}.`,
    credentialName: `${title} Credential`,
    pointsPerItem,
    itemsPerAttempt: perAttempt,
    totalPoints,
    passMark: Math.ceil(totalPoints * DEFAULT_PASS_RATIO),
    source: {
      tosRow: blueprintRow?.coverage ?? null,
      distribution: blueprintRow?.distribution ?? null,
      bankSize: items.length,
      generatedAt: new Date(),
      model,
      usage
    },
    items
  };
}

/* ───────────────────────── Generating one lesson quiz ───────────────────────── */

async function existingAssessment(courseId, moduleId, scope) {
  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) return null;

  const query =
    scope === "final"
      ? { courseId: { $in: idCandidates(courseId) }, scope: "final" }
      : { courseId: { $in: idCandidates(courseId) }, moduleId: { $in: idCandidates(moduleId) } };

  return collection(ASSESSMENTS_COLLECTION).findOne(query);
}

/**
 * Writes one lesson's quiz, or explains why it did not.
 *
 * Every return says what happened rather than throwing, because the caller is
 * a loop over 68 lessons and one lesson with no text must not stop the other
 * 67 — nor make the operator guess which ones were skipped.
 */
export async function generateModuleAssessment({
  courseId,
  moduleId,
  bankMultiplier = DEFAULT_BANK_MULTIPLIER,
  dryRun = false,
  model = null
}) {
  if (!databaseReady()) return { status: "error", reason: "database-not-connected" };

  const already = await existingAssessment(courseId, moduleId, "lesson");
  if (already) {
    return { status: "skipped", reason: "already-exists", assessmentId: asId(already._id) };
  }

  const [course, lesson] = await Promise.all([
    collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(courseId) } }),
    collection(MODULES_COLLECTION).findOne({ _id: { $in: idCandidates(moduleId) } })
  ]);

  if (!lesson) return { status: "error", reason: "module-not-found" };

  const blueprintRow = await loadLessonBlueprint(courseId, moduleId);
  if (!blueprintRow || !(blueprintRow.items > 0)) {
    return { status: "skipped", reason: "no-blueprint-row", moduleId: asId(moduleId) };
  }

  const textRecord = await loadModuleText(moduleId);
  const sourceText = toSourceText(textRecord);

  // The guard that saves the most money in practice: two thirds of the lessons
  // have no extracted text yet, and generating from nothing costs full price
  // for questions that would fail validation.
  if (!textRecord?.hasText || sourceText.length < 200) {
    return { status: "skipped", reason: "no-source-text", moduleId: asId(moduleId), title: lesson.title };
  }

  const itemsPerAttempt = blueprintRow.items;
  const bankSize = itemsPerAttempt * Math.max(1, bankMultiplier);

  if (dryRun) {
    return {
      status: "planned",
      moduleId: asId(moduleId),
      title: lesson.title,
      itemsPerAttempt,
      bankSize,
      sourceChars: sourceText.length,
      estimatedInputTokens: Math.round(sourceText.length / CHARS_PER_TOKEN),
      distribution: blueprintRow.distribution
    };
  }

  // Everything from here on is paid for, so every exit below records what it
  // cost — including the ones that store nothing.
  const spend = {
    kind: "assessment-generation",
    courseId,
    courseCode: course?.courseCode ?? null,
    moduleId,
    moduleTitle: lesson.title ?? blueprintRow.coverage,
    itemsRequested: bankSize
  };

  let generated;
  try {
    generated = await generateAssessmentItems({
      courseTitle: course?.title ?? course?.courseCode ?? "",
      moduleTitle: lesson.title ?? blueprintRow.coverage,
      sourceText,
      itemCount: bankSize,
      distribution: blueprintRow.distribution,
      model
    });
  } catch (error) {
    // A call that errors may still have been billed, and the operator needs to
    // see that it happened even though the token count is unknown.
    await recordApiUsage({ ...spend, outcome: "failed", error: error.message });
    return { status: "error", reason: "generation-failed", moduleId: asId(moduleId), message: error.message };
  }

  const items = mapGeneratedItems(generated.items);
  const document = buildAssessmentDocument({
    course,
    module: lesson,
    blueprintRow,
    items,
    itemsPerAttempt,
    model: generated.model,
    usage: generated.usage
  });

  const billed = {
    ...spend,
    model: generated.model,
    inputTokens: generated.usage?.inputTokens,
    outputTokens: generated.usage?.outputTokens,
    totalTokens: generated.usage?.totalTokens,
    itemsUsable: items.length
  };

  const check = validateAssessment(document);
  if (!check.valid) {
    // Nothing is stored, but it was still paid for — which is exactly the spend
    // the Assessment collection alone would never show.
    await recordApiUsage({ ...billed, outcome: "rejected" });

    return {
      status: "rejected",
      moduleId: asId(moduleId),
      problems: check.problems,
      usableItems: items.length,
      wanted: bankSize,
      usage: generated.usage
    };
  }

  try {
    const inserted = await collection(ASSESSMENTS_COLLECTION).insertOne(document);
    await recordApiUsage({ ...billed, outcome: "created" });

    return {
      status: "created",
      assessmentId: asId(inserted.insertedId),
      moduleId: asId(moduleId),
      title: document.title,
      itemsPerAttempt: document.itemsPerAttempt,
      bankSize: items.length,
      usage: generated.usage
    };
  } catch (error) {
    // The unique index caught a lesson two operators generated at once. The
    // call still happened, so it is still logged — the money was spent even
    // though the loser's document was thrown away.
    if (error?.code === 11000) {
      await recordApiUsage({ ...billed, outcome: "discarded-duplicate" });
      return { status: "skipped", reason: "already-exists", moduleId: asId(moduleId) };
    }
    throw error;
  }
}

/* ───────────────────────── Assembling the final ───────────────────────── */

/**
 * The final exam, built from the lesson banks — no model call at all.
 *
 * This is what the Table of Specification already describes: its rows are the
 * lessons, and they add up to one examination. So the questions for the final
 * have been written already, and assembling them costs nothing.
 *
 * Item ids are rewritten on the way in. A lesson quiz numbers its own
 * questions from 1, so pooling six of them unchanged would produce six
 * questions called "g1" in a single document, and grading matches on id.
 */
export async function assembleFinalAssessment({ courseId, dryRun = false }) {
  if (!databaseReady()) return { status: "error", reason: "database-not-connected" };

  const already = await existingAssessment(courseId, null, "final");
  if (already) {
    return { status: "skipped", reason: "already-exists", assessmentId: asId(already._id) };
  }

  const [course, blueprint] = await Promise.all([
    collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(courseId) } }),
    loadQuizBlueprint(courseId)
  ]);

  if (!blueprint || !(blueprint.totalItems > 0)) {
    return { status: "skipped", reason: "no-blueprint" };
  }

  const lessonQuizzes = (await collectionExists(ASSESSMENTS_COLLECTION))
    ? await collection(ASSESSMENTS_COLLECTION)
        .find({ courseId: { $in: idCandidates(courseId) }, scope: { $ne: "final" } })
        .toArray()
    : [];

  if (lessonQuizzes.length === 0) {
    return { status: "skipped", reason: "no-lesson-quizzes" };
  }

  const pool = [];
  lessonQuizzes.forEach((quiz, quizIndex) => {
    (quiz.items ?? []).forEach((item) => {
      const normalized = normalizeItem(item, pool.length);
      if (normalized) pool.push({ ...normalized, id: `m${quizIndex + 1}-${normalized.id}` });
    });
  });

  const wanted = blueprint.totalItems;
  if (pool.length < wanted) {
    return {
      status: "skipped",
      reason: "bank-too-small",
      pooled: pool.length,
      wanted
    };
  }

  const random = seededRandom(hashSeed("final", asId(courseId)));
  const byLevel = new Map(TOS_LEVELS.map((level) => [level, []]));
  const unlevelled = [];
  for (const item of pool) {
    if (item.level && byLevel.has(item.level)) byLevel.get(item.level).push(item);
    else unlevelled.push(item);
  }

  const wantedByLevel = {};
  for (const level of TOS_LEVELS) {
    wantedByLevel[level] = blueprint.rows.reduce(
      (sum, row) => sum + (row.distribution?.[level] ?? 0),
      0
    );
  }

  // The final gets a bank too, or every student would sit the identical paper —
  // there is no point drawing 64 questions from a pool of exactly 64. Take a
  // multiple of the paper length, keeping the blueprint's mix of levels in the
  // bank, and let each student draw their own 64 out of it.
  const scale = Math.max(1, Math.min(DEFAULT_BANK_MULTIPLIER, Math.floor(pool.length / wanted)));

  const picked = [];
  const used = new Set();
  for (const level of TOS_LEVELS) {
    const drawn = sample(byLevel.get(level) ?? [], wantedByLevel[level] * scale, random);
    for (const item of drawn) {
      picked.push(item);
      used.add(item.id);
    }
  }

  // Top up from whatever is left, so a course whose questions skew to one level
  // still fills a bank at least one paper long.
  const remainder = pool.filter((item) => !used.has(item.id)).concat(unlevelled);
  const topUp = sample(remainder, Math.max(0, wanted * scale - picked.length), random);
  const items = picked
    .concat(topUp)
    .map((item, index) => ({ ...item, n: index + 1 }));

  if (dryRun) {
    return {
      status: "planned",
      scope: "final",
      pooled: pool.length,
      itemsPerAttempt: wanted,
      bankSize: items.length,
      byLevel: wantedByLevel
    };
  }

  const document = buildAssessmentDocument({
    course,
    module: null,
    blueprintRow: { coverage: blueprint.examination, distribution: wantedByLevel },
    items,
    itemsPerAttempt: wanted,
    scope: "final",
    model: "assembled-from-lesson-banks"
  });

  const check = validateAssessment(document);
  if (!check.valid) return { status: "rejected", problems: check.problems };

  try {
    const inserted = await collection(ASSESSMENTS_COLLECTION).insertOne(document);
    return {
      status: "created",
      assessmentId: asId(inserted.insertedId),
      scope: "final",
      itemsPerAttempt: document.itemsPerAttempt,
      bankSize: items.length
    };
  } catch (error) {
    if (error?.code === 11000) return { status: "skipped", reason: "already-exists" };
    throw error;
  }
}

/* ───────────────────────── What is and is not ready ───────────────────────── */

/**
 * A course's generation state, without generating anything. Answers the two
 * questions worth asking before spending: which lessons still need a quiz, and
 * which of those have text to write one from.
 */
export async function getGenerationStatus(courseId) {
  if (!databaseReady()) return { status: "error", reason: "database-not-connected" };

  const blueprint = await loadQuizBlueprint(courseId);
  if (!blueprint) return { courseId: asId(courseId), rows: [], hasBlueprint: false };

  const [assessments, texts] = await Promise.all([
    (await collectionExists(ASSESSMENTS_COLLECTION))
      ? collection(ASSESSMENTS_COLLECTION).find({ courseId: { $in: idCandidates(courseId) } }).toArray()
      : [],
    (await collectionExists(TEXT_COLLECTION))
      ? collection(TEXT_COLLECTION).find({}, { projection: { moduleId: 1, hasText: 1, textLength: 1 } }).toArray()
      : []
  ]);

  const quizByModule = new Map(
    assessments.filter((doc) => doc.scope !== "final").map((doc) => [asId(doc.moduleId), doc])
  );
  const textByModule = new Map(texts.map((doc) => [asId(doc.moduleId), doc]));

  const rows = blueprint.rows.map((row) => {
    const quiz = quizByModule.get(asId(row.moduleId));
    const text = textByModule.get(asId(row.moduleId));

    return {
      moduleId: row.moduleId,
      coverage: row.coverage,
      itemsWanted: row.items,
      hasQuiz: Boolean(quiz),
      bankSize: quiz?.items?.length ?? 0,
      hasText: Boolean(text?.hasText),
      textLength: text?.textLength ?? 0,
      readyToGenerate: !quiz && Boolean(text?.hasText) && row.items > 0
    };
  });

  return {
    courseId: asId(courseId),
    courseCode: blueprint.courseCode,
    hasBlueprint: true,
    totalItems: blueprint.totalItems,
    hasFinal: assessments.some((doc) => doc.scope === "final"),
    counts: {
      lessons: rows.length,
      withQuiz: rows.filter((row) => row.hasQuiz).length,
      readyToGenerate: rows.filter((row) => row.readyToGenerate).length,
      blockedOnText: rows.filter((row) => !row.hasQuiz && !row.hasText).length
    },
    rows
  };
}

/**
 * One quiz per lesson, one final per course — enforced by the database rather
 * than by whoever happens to call the generator. Without it, two operators
 * pressing generate at the same moment produce two quizzes for one lesson,
 * which makes the final demand that both be passed.
 */
export async function ensureAssessmentIndexes() {
  if (!databaseReady()) return { created: false, reason: "database-not-connected" };

  await collection(ASSESSMENTS_COLLECTION).createIndex(
    { courseId: 1, moduleId: 1, scope: 1 },
    { unique: true, name: "one_assessment_per_lesson" }
  );

  return { created: true, index: "one_assessment_per_lesson" };
}
