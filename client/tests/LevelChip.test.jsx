import { describe, it, expect, beforeAll } from "@jest/globals";
import { render, screen } from "@testing-library/react";

/**
 * The level of thinking, on the question itself.
 *
 * It is the assessor's check before a paper is posted: the blueprint ordered a
 * mix of levels, and only a person reading the question can say whether it
 * really asks for that kind of thinking. A student never sees it — the server
 * leaves it off their copy of the paper (see assessments.format.test.js).
 */

let LevelChip;

beforeAll(async () => {
  LevelChip = (await import("../src/pages/assessor/components/tos/LevelChip.jsx")).default;
});

const chipFor = (level) => {
  const { container } = render(<LevelChip level={level} />);
  return container.querySelector(".chip");
};

describe("LevelChip", () => {
  it("names the level in the words the blueprint uses", () => {
    render(<LevelChip level="analyze" />);
    expect(screen.getByText("Analyzing")).toBeInTheDocument();
  });

  /**
   * Each level carries its own colour, and it is the colour that level's share
   * of the blueprint's bar is drawn in. The palette hangs off `data-level`, so
   * naming the level is what colours the chip.
   */
  it("draws each level in that level's own colour", () => {
    for (const level of ["remember", "understand", "apply", "analyze", "evaluate", "create"]) {
      const chip = chipFor(level);
      expect(chip.className).toContain("chip--level");
      expect(chip.dataset.level).toBe(level);
    }
  });

  /**
   * A question the generator left unlabelled, or labelled with a word outside
   * the taxonomy, says so. Drawing nothing would read as a question that has
   * been checked, when it is one the mix cannot account for.
   */
  it("says so when a question carries no level", () => {
    render(<LevelChip level={null} />);
    expect(screen.getByText("No level")).toBeInTheDocument();
  });

  it("refuses a word that is not one of the six levels", () => {
    render(<LevelChip level="memorize" />);
    expect(screen.getByText("No level")).toBeInTheDocument();
  });
});
