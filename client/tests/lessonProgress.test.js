import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  lessonPercent,
  lessonShare,
  mergeReading,
  readStoredReading,
  sectionPercent,
  sectionPercents,
  writeStoredReading
} from "../src/pages/student/lessonProgress";

/**
 * How far a student has read, and why the figure only ever goes up.
 *
 * The reader re-measures whenever the pane changes size — a figure finishing
 * loading is enough — so the same student, who has not moved, can be measured
 * against a taller page a moment later. Every rule here exists to stop that
 * being shown to them as having read less than they had.
 */

describe("lessonPercent", () => {
  it("is what is behind the bottom edge of the pane", () => {
    expect(lessonPercent(250, 1000)).toBe(25);
    expect(lessonPercent(500, 1000)).toBe(50);
  });

  /**
   * A lesson that fits on screen is fully read the moment it opens — the same
   * rule the completion check applies, so the percentage and the tick arrive
   * together rather than one of them lagging.
   */
  it("is full for a lesson short enough to need no scrolling", () => {
    expect(lessonPercent(600, 600)).toBe(100);
    expect(lessonPercent(900, 600)).toBe(100);
  });

  it("answers zero rather than nonsense for a pane it cannot measure", () => {
    expect(lessonPercent(100, 0)).toBe(0);
    expect(lessonPercent(Number.NaN, 1000)).toBe(0);
    expect(lessonPercent(100, undefined)).toBe(0);
  });
});

describe("sectionPercent", () => {
  const section = { id: "s2", top: 400, height: 200 };

  it("is nothing before the section has been reached", () => {
    expect(sectionPercent(section, 300)).toBe(0);
  });

  it("fills across the section as it passes under the edge", () => {
    expect(sectionPercent(section, 450)).toBe(25);
    expect(sectionPercent(section, 500)).toBe(50);
  });

  it("is full once the whole section is behind you, and stays there", () => {
    expect(sectionPercent(section, 600)).toBe(100);
    expect(sectionPercent(section, 5000)).toBe(100);
  });

  it("answers zero for a section it cannot measure", () => {
    expect(sectionPercent({ id: "x", top: 0, height: 0 }, 100)).toBe(0);
    expect(sectionPercent(null, 100)).toBe(0);
    expect(sectionPercent(section, Number.NaN)).toBe(0);
  });
});

describe("sectionPercents", () => {
  it("asks the same of every measured section", () => {
    const geometry = [
      { id: "a", top: 0, height: 100 },
      { id: "b", top: 100, height: 100 },
      { id: "c", top: 200, height: 100 }
    ];

    expect(sectionPercents(geometry, 150)).toEqual({ a: 100, b: 50, c: 0 });
  });

  it("has nothing to say about a lesson with no sections", () => {
    expect(sectionPercents([], 500)).toEqual({});
    expect(sectionPercents(undefined, 500)).toEqual({});
  });
});

describe("mergeReading", () => {
  const previous = { percent: 60, sections: { a: 100, b: 20 } };

  it("keeps the furthest figure for the lesson and for each section", () => {
    const merged = mergeReading(previous, { percent: 75, sections: { a: 100, b: 55 } });
    expect(merged).toEqual({ percent: 75, sections: { a: 100, b: 55 } });
  });

  /**
   * The page grew under a student who had not moved, so every measurement came
   * back smaller. None of it is a loss of progress.
   */
  it("never lets a re-measurement take progress away", () => {
    const merged = mergeReading(previous, { percent: 40, sections: { a: 70, b: 10 } });
    expect(merged).toEqual(previous);
  });

  /**
   * Reference equality, not just a matching shape: this runs on every scroll
   * event, and the caller returns the state object unchanged when nothing rose
   * so React has nothing to re-render — the pane being scrolled.
   */
  it("hands back the very object it was given when nothing moved", () => {
    expect(mergeReading(previous, { percent: 60, sections: { a: 100, b: 20 } })).toBe(previous);
    expect(mergeReading(undefined, { percent: 0, sections: {} })).toBe(undefined);
  });

  it("takes the first reading of a lesson never opened before", () => {
    expect(mergeReading(undefined, { percent: 12, sections: { a: 30 } })).toEqual({
      percent: 12,
      sections: { a: 30 }
    });
  });

  it("does not disturb the sections it was told nothing about", () => {
    const merged = mergeReading(previous, { percent: 60, sections: { b: 90 } });
    expect(merged).toEqual({ percent: 60, sections: { a: 100, b: 90 } });
  });
});

describe("what the browser remembers", () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    if (original) Object.defineProperty(window, "localStorage", original);
  });

  it("keeps a student's reading and gives it back", () => {
    const reading = { m1: { percent: 40, sections: { s1: 80 } } };
    writeStoredReading("stu-1", reading);
    expect(readStoredReading("stu-1")).toEqual(reading);
  });

  it("keeps two people on one machine apart", () => {
    writeStoredReading("stu-1", { m1: { percent: 40, sections: {} } });
    expect(readStoredReading("stu-2")).toEqual({});
  });

  it("reads nothing as not started", () => {
    expect(readStoredReading("nobody")).toEqual({});
    expect(readStoredReading(null)).toEqual({});
  });

  it("survives what was stored being unreadable", () => {
    window.localStorage.setItem("capstoneReading.stu-1", "{ not json");
    expect(readStoredReading("stu-1")).toEqual({});
  });

  /**
   * A private window, or a browser told to refuse site data, throws on the
   * accessor itself rather than returning nothing. The percentages still work
   * for the visit; they just do not outlive it.
   */
  it("survives a browser that refuses storage outright", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("access denied");
      }
    });

    expect(() => writeStoredReading("stu-1", { m1: { percent: 1, sections: {} } })).not.toThrow();
    expect(readStoredReading("stu-1")).toEqual({});
  });
});

/**
 * A lesson is two pieces of work, and reading is only one of them.
 *
 * It used to be the whole figure, so a lesson sat at 100% with its quiz
 * untouched and the ring in the rail said finished about a lesson that was not.
 */
describe("lessonShare", () => {
  it("gives reading half the lesson", () => {
    expect(lessonShare(0, false)).toBe(0);
    expect(lessonShare(50, false)).toBe(25);
    expect(lessonShare(100, false)).toBe(50);
  });

  it("gives the quiz the other half", () => {
    expect(lessonShare(0, true)).toBe(50);
    expect(lessonShare(100, true)).toBe(100);
  });

  /** Read to the end and passed is the only way to a full lesson. */
  it("is full only when both halves are done", () => {
    expect(lessonShare(100, false)).toBeLessThan(100);
    expect(lessonShare(99, true)).toBeLessThan(100);
    expect(lessonShare(100, true)).toBe(100);
  });

  it("cannot be pushed past either end", () => {
    expect(lessonShare(150, true)).toBe(100);
    expect(lessonShare(-20, false)).toBe(0);
    expect(lessonShare(Number.NaN, true)).toBe(50);
  });
});
