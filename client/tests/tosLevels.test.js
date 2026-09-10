import { describe, it, expect } from "@jest/globals";
import {
  LEVEL_KEYS,
  apportion,
  autoFill,
  columnTotals,
  groupItems,
  share,
  splitItems,
  toCount
} from "../src/pages/assessor/components/tos/levels";

/**
 * The arithmetic a Table of Specification is checked by.
 *
 * All of it is about one thing: a blueprint has to add up. An assessor who
 * says "40 questions, 40% lower-order" and is handed 39 is hunting a rounding
 * error rather than writing a paper, so every split here has to land on its
 * total exactly — not close.
 */

const split = (values) => Object.fromEntries(LEVEL_KEYS.map((key, i) => [key, values[i] ?? 0]));

describe("toCount", () => {
  it("keeps whole positive numbers and refuses everything else", () => {
    expect(toCount("7")).toBe(7);
    expect(toCount(3)).toBe(3);
    expect(toCount("")).toBe(0);
    expect(toCount("abc")).toBe(0);
    expect(toCount(-4)).toBe(0);
    expect(toCount(2.9)).toBe(2);
    expect(toCount(undefined)).toBe(0);
  });
});

describe("splitItems and groupItems", () => {
  it("adds a split across every level", () => {
    expect(splitItems(split([1, 2, 3, 4, 5, 6]))).toBe(21);
  });

  it("splits lower-order from higher-order at the same place the guide does", () => {
    const paper = split([4, 6, 6, 8, 8, 8]);
    expect(groupItems(paper, "lots")).toBe(16);
    expect(groupItems(paper, "hots")).toBe(24);
  });
});

describe("share", () => {
  it("reads 0% off an empty paper rather than NaN", () => {
    expect(share(0, 0)).toBe(0);
    expect(share(5, 0)).toBe(0);
  });

  it("rounds for display", () => {
    expect(share(5, 40)).toBe(13);
    expect(share(16, 40)).toBe(40);
  });
});

describe("apportion", () => {
  /** The guide's own worked example: 40 items split 40/60. */
  it("spends the whole total, to the item", () => {
    expect(apportion(40, [40, 60])).toEqual([16, 24]);
  });

  it("hands the remainder out rather than dropping it", () => {
    const parts = apportion(10, [1, 1, 1]);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(10);
    expect(parts).toEqual([4, 3, 3]);
  });

  it("gives nothing away when there is nothing to give", () => {
    expect(apportion(0, [1, 2, 3])).toEqual([0, 0, 0]);
    expect(apportion(10, [0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("autoFill", () => {
  /**
   * The example the guide is written around — eight lessons of five, split
   * 4/6/6 lower and 8/16/0 higher. Both margins have to land exactly, which is
   * the whole difficulty: weighting each cell by row times column and rounding
   * the grid in one pass gives every row the same tie to break, and Remembering
   * comes out with none of the four questions it was promised.
   */
  it("lands on both margins at once", () => {
    const rows = [5, 5, 5, 5, 5, 5, 5, 5];
    const columns = split([4, 6, 6, 8, 16, 0]);
    const grid = autoFill(rows, columns);

    expect(grid.map(splitItems)).toEqual(rows);
    expect(columnTotals(grid)).toEqual(columns);
  });

  it("holds when the lessons are not the same size", () => {
    const rows = [10, 8, 6, 6, 4, 3, 2, 1];
    const columns = split([4, 6, 6, 8, 8, 8]);
    const grid = autoFill(rows, columns);

    expect(grid.map(splitItems)).toEqual(rows);
    expect(columnTotals(grid)).toEqual(columns);
  });

  it("fills a single lesson straight from the level split", () => {
    const columns = split([1, 2, 0, 3, 4, 0]);
    expect(autoFill([10], columns)).toEqual([columns]);
  });

  /**
   * A half-written blueprint is the normal state of the screen, so the fill
   * must not throw or invent items when the two splits disagree — it hands out
   * what the columns actually hold and the margins go on saying so.
   */
  it("gives out only what the columns hold when the splits disagree", () => {
    const grid = autoFill([5, 5], split([2, 2, 0, 0, 0, 0]));
    expect(grid.reduce((sum, row) => sum + splitItems(row), 0)).toBe(4);
  });

  it("assigns nothing when no level has been given a share", () => {
    const grid = autoFill([5, 5], split([0, 0, 0, 0, 0, 0]));
    expect(grid.reduce((sum, row) => sum + splitItems(row), 0)).toBe(0);
  });
});
