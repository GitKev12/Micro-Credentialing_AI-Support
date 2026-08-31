/**
 * The shape of a Table of Specification, and the arithmetic over it.
 *
 * Separated from the screen because none of it is about rendering: the columns
 * are a fixed taxonomy, and the totals are the same sums whether a table or a
 * test is asking for them.
 */

/**
 * A blueprint is identified by its course, but the collection allows a
 * document with no courseId, and two of those would collide on `null`. Its own
 * _id is the stable fallback — the save still posts the courseId.
 */
export function blueprintKey(entry) {
  return entry.courseId ?? entry.id;
}

// Bloom's taxonomy columns, in the order the blueprint lists them.
export const LEVELS = [
  { key: "remember", label: "Remembering" },
  { key: "understand", label: "Understanding" },
  { key: "apply", label: "Applying" },
  { key: "analyze", label: "Analyzing" },
  { key: "evaluate", label: "Evaluating" },
  { key: "create", label: "Creating" }
];

export const EMPTY_ROW = {
  course: "",
  hours: 0,
  remember: 0,
  understand: 0,
  apply: 0,
  analyze: 0,
  evaluate: 0,
  create: 0
};

export function toNumber(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** How many items one row asks for, across every level. */
export const rowItems = (row) => LEVELS.reduce((sum, level) => sum + (row[level.key] || 0), 0);

/**
 * The figures the summary strip reports.
 *
 * `itemsPerQuiz` is null when the rows disagree: each row states one quiz's
 * worth of items, so when they all match that is the size of every generated
 * quiz, and when they do not there is no single figure to show — generation
 * follows each row instead.
 */
export function blueprintTotals(rows) {
  const perRow = rows.map(rowItems);
  const uniform = perRow.length > 0 && perRow.every((n) => n === perRow[0]);

  return {
    totalHours: rows.reduce((sum, row) => sum + (row.hours || 0), 0),
    grandTotal: rows.reduce((sum, row) => sum + rowItems(row), 0),
    itemsPerQuiz: uniform ? perRow[0] : null
  };
}
