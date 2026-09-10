/**
 * The taxonomy a Table of Specification is written in, and the arithmetic over
 * it.
 *
 * Kept apart from the screens because none of it is about rendering: the six
 * levels are a fixed vocabulary, and a column total is the same sum whether a
 * table, a bar or a generator is asking for it.
 *
 * The two groups are the division the blueprint is actually reasoned in — an
 * assessor decides "40% lower, 60% higher" first and only then splits each
 * share three ways, so the group is a real level of the model rather than a
 * heading over the columns.
 */

export const LEVELS = [
  {
    key: "remember",
    label: "Remembering",
    short: "Rem",
    group: "lots",
    blurb: "Recalling facts, terms and definitions"
  },
  {
    key: "understand",
    label: "Understanding",
    short: "Und",
    group: "lots",
    blurb: "Explaining or interpreting concepts"
  },
  {
    key: "apply",
    label: "Applying",
    short: "App",
    group: "lots",
    blurb: "Using knowledge or a procedure in a given situation"
  },
  {
    key: "analyze",
    label: "Analyzing",
    short: "Ana",
    group: "hots",
    blurb: "Breaking information apart, finding relationships"
  },
  {
    key: "evaluate",
    label: "Evaluating",
    short: "Eva",
    group: "hots",
    blurb: "Judging or choosing against criteria"
  },
  {
    key: "create",
    label: "Creating",
    short: "Cre",
    group: "hots",
    blurb: "Producing or designing something new"
  }
];

export const GROUPS = [
  { key: "lots", label: "LOTS", name: "Lower-order thinking" },
  { key: "hots", label: "HOTS", name: "Higher-order thinking" }
];

export const LEVEL_KEYS = LEVELS.map((level) => level.key);

export const levelsIn = (group) => LEVELS.filter((level) => level.group === group);

/** A blank split, which is also the shape every row of the blueprint has. */
export const emptySplit = () => Object.fromEntries(LEVEL_KEYS.map((key) => [key, 0]));

/** Whole, non-negative, and never NaN — every figure on this screen is a count. */
export function toCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** How many items one split asks for, across every level. */
export const splitItems = (split) =>
  LEVEL_KEYS.reduce((sum, key) => sum + toCount(split?.[key]), 0);

/** What one group's three levels come to. */
export const groupItems = (split, group) =>
  levelsIn(group).reduce((sum, level) => sum + toCount(split?.[level.key]), 0);

/** Column totals down a set of rows — the level distribution of a whole paper. */
export function columnTotals(rows) {
  const totals = emptySplit();
  for (const row of rows ?? []) {
    for (const key of LEVEL_KEYS) totals[key] += toCount(row?.[key]);
  }
  return totals;
}

/**
 * A share of a whole as a percentage, rounded for display only.
 *
 * Returns 0 rather than NaN on an empty paper, because "0%" is the truthful
 * reading of a blueprint that asks for nothing yet.
 */
export const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Spread `total` over `weights` so the parts sum to exactly `total`.
 *
 * Largest-remainder, not round-and-hope: rounding each share on its own leaves
 * a blueprint one or two items off its own stated length, and the assessor is
 * then hunting a rounding error rather than writing a paper. The remainder
 * goes to the largest fractional parts, and ties go to the earlier level so
 * the same weights always produce the same split.
 */
export function apportion(total, weights) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (!(total > 0) || !(sum > 0)) return weights.map(() => 0);

  const exact = weights.map((weight) => (weight / sum) * total);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((acc, value) => acc + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const out = [...floors];
  for (const { index } of order) {
    if (left <= 0) break;
    out[index] += 1;
    left -= 1;
  }
  return out;
}

/**
 * A first draft of the matrix, from the two distributions that define it.
 *
 * The assessor has already said how many items each lesson gets and how many
 * each level gets; the matrix is where those two answers meet, and 48 cells is
 * a great many to type when the obvious opening move is "spread each lesson's
 * share the way the whole paper is spread".
 *
 * Rows are filled one at a time against what each column has left rather than
 * against its original target, which is what keeps both margins honest.
 * Weighting every cell by row x column and rounding the grid in one pass looks
 * tidier and is wrong: with eight lessons of equal size every row ties, the
 * remainder lands in the same two columns eight times over, and a level the
 * blueprint asked four questions of ends up with none. Draining the capacity
 * as it is spent makes each row correct the ones before it, and leaves the
 * last row with only the columns still owed items.
 *
 * A draft, not an answer — every cell stays editable and the margins go on
 * reporting what they actually add up to.
 */
export function autoFill(rowTargets, colTargets) {
  const capacityLeft = LEVELS.map((level) => Math.max(0, toCount(colTargets?.[level.key])));

  return rowTargets.map((rowTarget) => {
    const room = capacityLeft.reduce((sum, value) => sum + value, 0);
    const cells = apportion(Math.min(toCount(rowTarget), room), capacityLeft);

    // apportion works off weights, not ceilings, so a row can be handed more of
    // a column than the column still owes. Move the overflow to the columns
    // that still have room; the loop ends because the total room only shrinks.
    let over = 0;
    for (let index = 0; index < cells.length; index += 1) {
      if (cells[index] > capacityLeft[index]) {
        over += cells[index] - capacityLeft[index];
        cells[index] = capacityLeft[index];
      }
    }
    while (over > 0) {
      const spare = cells.map((value, index) => capacityLeft[index] - value);
      const total = spare.reduce((sum, value) => sum + value, 0);
      if (total <= 0) break;

      let moved = 0;
      apportion(Math.min(over, total), spare).forEach((value, index) => {
        const take = Math.min(value, spare[index]);
        cells[index] += take;
        moved += take;
      });
      if (moved === 0) break;
      over -= moved;
    }

    cells.forEach((value, index) => {
      capacityLeft[index] -= value;
    });

    return Object.fromEntries(LEVELS.map((level, index) => [level.key, cells[index]]));
  });
}
