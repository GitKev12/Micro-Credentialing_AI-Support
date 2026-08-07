import mongoose from "mongoose";
import { collectionExists } from "../lib/mongo.js";
import { TOS_LEVELS } from "./assessments.format.js";

/**
 * The Table of Specification, read as instructions for generating a quiz.
 *
 * One blueprint per course, its rows being that course's lessons: a row is one
 * lesson's quiz, and says how many items to write at each level of thinking.
 * scripts/import-tos.mjs draws the whole set from the official spreadsheet.
 *
 * The current form is uniform — every row asks for the same ten — so one
 * quiz's shape can be stated once. When rows differ, `uniform` is false and
 * the generator should follow each row rather than a single figure.
 */

const TOS_COLLECTION = "TableOfSpecification";

const toCount = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Items asked of one TOS row, by level and in total. */
export function rowDistribution(row) {
  const distribution = {};
  TOS_LEVELS.forEach((level) => {
    distribution[level] = toCount(row?.[level]);
  });
  const items = TOS_LEVELS.reduce((sum, level) => sum + distribution[level], 0);
  return { distribution, items };
}

/**
 * Turns a stored TOS into the numbers a generator needs.
 *
 * `itemsPerQuiz` is null when rows disagree — a single number would be a
 * guess, and guessing here would silently produce quizzes the blueprint never
 * asked for.
 */
export function blueprintFromTos(doc) {
  const rows = Array.isArray(doc?.rows) ? doc.rows : [];
  const perRow = rows.map((row) => rowDistribution(row));
  const totalItems = perRow.reduce((sum, row) => sum + row.items, 0);

  const first = perRow[0];

  // Two different questions. `uniform` asks whether every row wants the same
  // mix of levels; `sameSize` only asks whether they want the same number of
  // items. Splitting a 60-item examination across a course's lessons often
  // gives every quiz the same length while the mix differs row to row, and a
  // generator still needs to know that length.
  const uniform =
    perRow.length > 0 &&
    perRow.every((row) => TOS_LEVELS.every((level) => row.distribution[level] === first.distribution[level]));
  const sameSize = perRow.length > 0 && perRow.every((row) => row.items === first.items);

  return {
    examination: doc?.examination ?? "",
    courseId: doc?.courseId ? String(doc.courseId) : null,
    courseCode: doc?.courseCode ?? "",
    rowCount: rows.length,
    totalItems,
    uniform,
    sameSize,
    // How long one quiz is, when the rows agree on that much.
    itemsPerQuiz: sameSize ? first.items : null,
    // The exact mix, only when every row asks for the same one.
    distribution: uniform ? first.distribution : null,
    // Always available, so a generator can work row by row regardless. The
    // moduleId is what ties a row to the lesson whose quiz it governs.
    rows: rows.map((row, index) => ({
      coverage: String(row?.course ?? ""),
      moduleId: row?.moduleId ? String(row.moduleId) : null,
      hours: toCount(row?.hours),
      ...perRow[index]
    }))
  };
}

/** A course's stored blueprint, or null when it has none. */
export async function loadTosDocument(courseId) {
  if (mongoose.connection.readyState !== 1) return null;
  if (!(await collectionExists(TOS_COLLECTION))) return null;
  if (!courseId) return null;

  return mongoose.connection
    .collection(TOS_COLLECTION)
    .findOne({ courseId: String(courseId) });
}

/** The blueprint a quiz generator should follow for one course. */
export async function loadQuizBlueprint(courseId) {
  const doc = await loadTosDocument(courseId);
  return doc ? blueprintFromTos(doc) : null;
}

/**
 * The blueprint row governing one lesson's quiz — what a generator needs when
 * it is writing questions for a specific lesson.
 */
export async function loadLessonBlueprint(courseId, moduleId) {
  const blueprint = await loadQuizBlueprint(courseId);
  if (!blueprint) return null;

  const row = blueprint.rows.find((entry) => String(entry.moduleId) === String(moduleId));
  return row ? { ...row, examination: blueprint.examination, courseId: blueprint.courseId } : null;
}
