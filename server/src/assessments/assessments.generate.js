import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { hashSeed, sample, seededRandom } from "../lib/random.js";
import { loadLessonBlueprint, loadQuizBlueprint } from "./assessments.blueprint.js";
import {
  DEFAULT_FINAL_MINUTES,
  DEFAULT_POINTS_PER_ITEM,
  ITEM_TYPES,
  TOS_LEVELS,
  defaultPassMark,
  normalizeItem,
  normalizeMinutes,
  validateAssessment
} from "./assessments.format.js";
import { generateAssessmentItems } from "../integrations/openai/openai.client.js";
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

/**
 * How long a final assessment is, whatever the blueprint adds up to.
 *
 * The imported Tables of Specification each described a 60-item examination,
 * so the final took the blueprint's whole total and matched it. Lesson quizzes
 * are a fixed length now, which makes that total grow with the number of
 * lessons — this keeps the final the paper it was meant to be.
 */
const FINAL_ASSESSMENT_ITEMS = 60;

/**
 * The longest paper an assessor may ask for.
 *
 * The item count is now typed into a form rather than read off the Table of
 * Specification, and a form field is a place where 600 gets entered instead of
 * 60. The cap is what stops one keystroke turning into a call that reads the
 * lesson once and then writes for ten minutes.
 */
const MAX_REQUESTED_ITEMS = 120;

/** A requested length, clamped, or null when nothing usable was asked for. */
function requestedItems(raw) {
  const count = Math.floor(Number(raw));
  if (!Number.isFinite(count) || count < 1) return null;
  return Math.min(count, MAX_REQUESTED_ITEMS);
}

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
  itemsPerModule = null,
  topics = null,
  scope = "lesson",
  // Written shut. Generating a paper and releasing it are two decisions now,
  // and only the assessor makes the second one — see postAssessment.
  status = "draft",
  timeLimitMinutes = null,
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
    status: status === "posted" ? "posted" : "draft",
    postedAt: null,
    postedBy: null,
    // A final runs to a clock; a lesson quiz does not unless someone sets one.
    timeLimitMinutes:
      normalizeMinutes(timeLimitMinutes) ?? (scope === "final" ? DEFAULT_FINAL_MINUTES : null),
    title,
    description:
      scope === "final"
        ? "Covers every lesson in the course."
        : `Covers ${blueprintRow?.coverage ?? lesson?.title ?? "this lesson"}.`,
    credentialName: `${title} Credential`,
    pointsPerItem,
    itemsPerAttempt: perAttempt,
    // A final says how its questions are divided between the lessons; a lesson
    // quiz has one lesson and needs neither. See selectItemsFor.
    itemsPerModule,
    topics,
    totalPoints,
    passMark: defaultPassMark(totalPoints),
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
  model = null,
  // The assessor's three decisions, all optional: how long the paper is, how
  // long the sitting is, and whether an existing draft is being rewritten. Left
  // unset, the Table of Specification decides the length as it always did.
  itemCount = null,
  timeLimitMinutes = null,
  status = "draft",
  replaceExisting = false
}) {
  if (!databaseReady()) return { status: "error", reason: "database-not-connected" };

  const already = await existingAssessment(courseId, moduleId, "lesson");
  if (already && !replaceExisting) {
    return { status: "skipped", reason: "already-exists", assessmentId: asId(already._id) };
  }

  const [course, lesson] = await Promise.all([
    collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(courseId) } }),
    collection(MODULES_COLLECTION).findOne({ _id: { $in: idCandidates(moduleId) } })
  ]);

  if (!lesson) return { status: "error", reason: "module-not-found" };

  const blueprintRow = await loadLessonBlueprint(courseId, moduleId);

  // An assessor who typed a length has said what the paper is; the blueprint
  // then only supplies the mix of thinking levels. Without one, the blueprint
  // is still the whole answer, and a lesson it does not cover has no quiz.
  const wantedItems = requestedItems(itemCount) ?? (blueprintRow?.items > 0 ? blueprintRow.items : 0);
  if (!(wantedItems > 0)) {
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

  const itemsPerAttempt = wantedItems;
  const bankSize = Math.min(itemsPerAttempt * Math.max(1, bankMultiplier), MAX_REQUESTED_ITEMS * 2);

  if (dryRun) {
    return {
      status: "planned",
      moduleId: asId(moduleId),
      title: lesson.title,
      itemsPerAttempt,
      bankSize,
      sourceChars: sourceText.length,
      estimatedInputTokens: Math.round(sourceText.length / CHARS_PER_TOKEN),
      distribution: blueprintRow?.distribution ?? null
    };
  }

  let generated;
  try {
    generated = await generateAssessmentItems({
      courseTitle: course?.title ?? course?.courseCode ?? "",
      moduleTitle: lesson.title ?? blueprintRow.coverage,
      sourceText,
      itemCount: bankSize,
      distribution: blueprintRow?.distribution ?? null,
      model
    });
  } catch (error) {
    return { status: "error", reason: "generation-failed", moduleId: asId(moduleId), message: error.message };
  }

  const items = mapGeneratedItems(generated.items);
  const document = buildAssessmentDocument({
    course,
    module: lesson,
    blueprintRow,
    items,
    itemsPerAttempt,
    status,
    timeLimitMinutes,
    model: generated.model,
    usage: generated.usage
  });

  const check = validateAssessment(document);
  if (!check.valid) {
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
    // Rewriting a draft keeps the document it replaces, rather than deleting
    // and inserting: an assessment's id is what a StudentResult points at, and
    // a regenerated paper that took a new id would orphan every mark against it.
    if (already) {
      await collection(ASSESSMENTS_COLLECTION).replaceOne({ _id: already._id }, document);

      return {
        status: "replaced",
        assessmentId: asId(already._id),
        moduleId: asId(moduleId),
        title: document.title,
        itemsPerAttempt: document.itemsPerAttempt,
        bankSize: items.length,
        usage: generated.usage
      };
    }

    const inserted = await collection(ASSESSMENTS_COLLECTION).insertOne(document);

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
    // loser's document is thrown away.
    if (error?.code === 11000) {
      return { status: "skipped", reason: "already-exists", moduleId: asId(moduleId) };
    }
    throw error;
  }
}

/* ───────────────────────── Assembling the final ───────────────────────── */

/**
 * Splits `total` whole items across `weights` in proportion, largest remainder
 * first.
 *
 * "Share N whole things out in proportion" is the same problem twice over when
 * a final is assembled — once across the lessons, once across the levels within
 * a lesson — and both have to round the same way. Handing the leftovers to the
 * largest fractions is what keeps it proportional rather than favouring
 * whichever key happened to be listed first.
 */
function shareOut(weights, total) {
  const keys = Object.keys(weights);
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));

  const weightOf = (key) => Math.max(0, Number(weights[key]) || 0);
  const sum = keys.reduce((running, key) => running + weightOf(key), 0);
  if (!(sum > 0) || !(total > 0)) return counts;

  const exact = {};
  let assigned = 0;
  for (const key of keys) {
    exact[key] = (weightOf(key) / sum) * total;
    counts[key] = Math.floor(exact[key]);
    assigned += counts[key];
  }

  const order = keys
    .filter((key) => weightOf(key) > 0)
    .sort((left, right) => exact[right] - counts[right] - (exact[left] - counts[left]));

  let remaining = total - assigned;
  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    counts[order[cursor % order.length]] += 1;
    remaining -= 1;
    cursor += 1;
  }

  return counts;
}

/**
 * How many of the final's questions each lesson gets.
 *
 * The blueprint already answers this — its rows are the lessons, and each row
 * says how many items that lesson is worth — so the split follows the Table of
 * Specification rather than inventing a rule. Two corrections on top of it:
 *
 * No lesson is asked for more questions than its bank holds, and every lesson
 * has to appear at least once. Skill gap analysis reports one score per lesson,
 * and a lesson that drew no questions has no score to report: its Skill Score
 * would be 0/0, which is not a gap, it is a missing measurement.
 *
 * A course with more lessons than the paper has questions cannot satisfy that
 * last rule, and the leftover lessons are returned at zero rather than pretended
 * about — the caller reports them as unassessed.
 */
function allocateAcrossLessons(weights, capacity, total) {
  const counts = shareOut(weights, total);
  const lessons = Object.keys(counts);
  const roomOf = (lesson) => Math.max(0, capacity[lesson] ?? 0);

  for (const lesson of lessons) {
    counts[lesson] = Math.min(counts[lesson], roomOf(lesson));
  }

  // Whatever the caps freed goes back to lessons that can still take it, so the
  // paper stays the length it says it is.
  let shortfall = total - lessons.reduce((sum, lesson) => sum + counts[lesson], 0);
  while (shortfall > 0) {
    const room = lessons.filter((lesson) => counts[lesson] < roomOf(lesson));
    if (room.length === 0) break;

    for (const lesson of room) {
      if (shortfall === 0) break;
      counts[lesson] += 1;
      shortfall -= 1;
    }
  }

  for (const lesson of lessons) {
    if (counts[lesson] > 0 || roomOf(lesson) < 1) continue;

    const donor = lessons
      .filter((other) => counts[other] > 1)
      .sort((left, right) => counts[right] - counts[left])[0];
    if (!donor) break;

    counts[donor] -= 1;
    counts[lesson] = 1;
  }

  return counts;
}

/**
 * `count` questions from one lesson's bank, following that lesson's TOS row for
 * the mix of thinking levels and topping up from the rest of the bank when the
 * lesson's questions skew to one level.
 */
function drawFromLesson(lessonItems, count, distribution, random) {
  const take = Math.min(count, lessonItems.length);
  if (take <= 0) return [];

  const byLevel = new Map();
  for (const item of lessonItems) {
    const level = TOS_LEVELS.includes(item.level) ? item.level : "";
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(item);
  }

  const wantByLevel = shareOut(
    Object.fromEntries(TOS_LEVELS.map((level) => [level, distribution?.[level] ?? 0])),
    take
  );

  const drawn = [];
  const used = new Set();
  for (const level of TOS_LEVELS) {
    for (const item of sample(byLevel.get(level) ?? [], wantByLevel[level], random)) {
      drawn.push(item);
      used.add(item.id);
    }
  }

  const remaining = lessonItems.filter((item) => !used.has(item.id));
  drawn.push(...sample(remaining, take - drawn.length, random));

  return drawn;
}

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
export async function assembleFinalAssessment({
  courseId,
  dryRun = false,
  itemCount = null,
  timeLimitMinutes = null,
  status = "draft",
  replaceExisting = false
}) {
  if (!databaseReady()) return { status: "error", reason: "database-not-connected" };

  const already = await existingAssessment(courseId, null, "final");
  if (already && !replaceExisting) {
    return { status: "skipped", reason: "already-exists", assessmentId: asId(already._id) };
  }

  const [course, blueprint] = await Promise.all([
    collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(courseId) } }),
    loadQuizBlueprint(courseId)
  ]);

  const asked = requestedItems(itemCount);

  // The blueprint is what says how long the paper is and how it divides. An
  // assessor who typed a length has answered the first half themselves, so a
  // course whose Table of Specification never arrived can still be given a
  // final — the lessons then share it evenly.
  if (!asked && (!blueprint || !(blueprint.totalItems > 0))) {
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

  // Every pooled question keeps the lesson it was written for. A final draws
  // from all of them at once, and skill gap analysis reports one score per
  // lesson — so the lesson has to travel with the question or a graded final is
  // a single number with no way back to a topic.
  //
  // The id prefix is not that link. It only keeps ids unique across banks that
  // each number their own questions from 1; `moduleId` is the lesson.
  const rowByModule = new Map(
    (blueprint?.rows ?? []).filter((row) => row.moduleId).map((row) => [asId(row.moduleId), row])
  );

  const pool = [];
  const poolByModule = new Map();

  lessonQuizzes.forEach((quiz, quizIndex) => {
    // A quiz belonging to no lesson cannot be scored per topic, and the final
    // is the only paper where that matters.
    if (!quiz.moduleId) return;

    const moduleId = asId(quiz.moduleId);
    const topic = rowByModule.get(moduleId)?.coverage || quiz.title || "";
    const lessonItems = [];

    (quiz.items ?? []).forEach((item) => {
      const normalized = normalizeItem(item, pool.length);
      if (!normalized) return;

      const tagged = {
        ...normalized,
        id: `m${quizIndex + 1}-${normalized.id}`,
        moduleId,
        topic
      };
      pool.push(tagged);
      lessonItems.push(tagged);
    });

    if (lessonItems.length > 0) poolByModule.set(moduleId, lessonItems);
  });

  if (poolByModule.size === 0) {
    return { status: "skipped", reason: "no-lesson-items" };
  }

  // The final is one sitting, not the sum of the course's lesson quizzes. It
  // used to be exactly `blueprint.totalItems`, which was the same 60 in every
  // imported blueprint — but that number now follows lesson count, so a
  // fifteen-lesson course would set a 150-question paper. Capped at the length
  // an examination is actually written to be; the blueprint still decides how
  // the paper is divided, and shorter blueprints still give a shorter paper.
  const wanted = asked ?? Math.min(blueprint.totalItems, FINAL_ASSESSMENT_ITEMS);
  if (pool.length < wanted) {
    return {
      status: "skipped",
      reason: "bank-too-small",
      pooled: pool.length,
      wanted
    };
  }

  const random = seededRandom(hashSeed("final", asId(courseId)));

  const lessons = [...poolByModule.keys()];
  const itemsPerModule = allocateAcrossLessons(
    Object.fromEntries(lessons.map((id) => [id, rowByModule.get(id)?.items || 1])),
    Object.fromEntries(lessons.map((id) => [id, poolByModule.get(id).length])),
    wanted
  );

  // What each lesson is worth on the paper, kept in the readable form the skill
  // gap report needs: its name, and the denominator of its Skill Score.
  const topics = lessons.map((moduleId) => ({
    moduleId,
    topic: poolByModule.get(moduleId)[0]?.topic || "",
    items: itemsPerModule[moduleId] ?? 0
  }));

  // The final gets a bank too, or every student would sit the identical paper —
  // there is no point drawing 60 questions from a pool of exactly 60. Take a
  // multiple of each lesson's quota, so the bank holds enough of every lesson
  // for any student's paper to be fillable from it.
  const scale = Math.max(1, Math.min(DEFAULT_BANK_MULTIPLIER, Math.floor(pool.length / wanted)));

  const items = lessons
    .flatMap((moduleId) =>
      drawFromLesson(
        poolByModule.get(moduleId),
        (itemsPerModule[moduleId] ?? 0) * scale,
        rowByModule.get(moduleId)?.distribution,
        random
      )
    )
    .map((item, index) => ({ ...item, n: index + 1 }));

  // Reported rather than assumed: the mix a bank actually came out with can
  // differ from the blueprint when a lesson's questions skew to one level.
  const byLevel = Object.fromEntries(TOS_LEVELS.map((level) => [level, 0]));
  for (const item of items) {
    if (TOS_LEVELS.includes(item.level)) byLevel[item.level] += 1;
  }

  if (dryRun) {
    return {
      status: "planned",
      scope: "final",
      pooled: pool.length,
      itemsPerAttempt: wanted,
      bankSize: items.length,
      byLevel,
      topics,
      // Named so the operator sees it before the paper is written, not after a
      // student's skill gap report comes back with a lesson missing.
      unassessedLessons: topics.filter((entry) => entry.items === 0).map((entry) => entry.topic)
    };
  }

  const document = buildAssessmentDocument({
    course,
    module: null,
    blueprintRow: { coverage: blueprint?.examination ?? "", distribution: byLevel },
    items,
    itemsPerAttempt: wanted,
    itemsPerModule,
    topics,
    scope: "final",
    status,
    timeLimitMinutes,
    model: "assembled-from-lesson-banks"
  });

  const check = validateAssessment(document);
  if (!check.valid) return { status: "rejected", problems: check.problems };

  try {
    // Same reasoning as a lesson quiz: the paper is rewritten in place so its
    // id survives, because that id is what every mark against it points at.
    if (already) {
      await collection(ASSESSMENTS_COLLECTION).replaceOne({ _id: already._id }, document);
      return {
        status: "replaced",
        assessmentId: asId(already._id),
        scope: "final",
        itemsPerAttempt: document.itemsPerAttempt,
        bankSize: items.length
      };
    }

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
      // Written and released are two different states now, and "has a quiz" no
      // longer means the students of the course can see one.
      posted: Boolean(quiz) && quiz.status !== "draft",
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
    finalPosted: assessments.some((doc) => doc.scope === "final" && doc.status !== "draft"),
    counts: {
      lessons: rows.length,
      withQuiz: rows.filter((row) => row.hasQuiz).length,
      posted: rows.filter((row) => row.posted).length,
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
