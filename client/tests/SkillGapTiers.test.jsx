import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent, act } from "@testing-library/react";

import SkillGapAnalysis from "../src/pages/student/components/SkillGapAnalysis.jsx";
import CutoffEditor from "../src/pages/assessor/components/CutoffEditor.jsx";
import { gapAdvice } from "../src/pages/student/performance.js";

const tiers = [
  { id: "strength", status: "Strength", min: 80, max: 100 },
  { id: "competent", status: "Competent", min: 60, max: 79 },
  { id: "needs-improvement", status: "Needs Improvement", min: 40, max: 59 },
  { id: "skill-gap", status: "Significant Skill Gap", min: 0, max: 39 }
];

describe("skill gap hover info", () => {
  it("shows the skill, score, target, gap and status", () => {
    render(
      <SkillGapAnalysis
        cutoff={60}
        tiers={tiers}
        skills={[
          { moduleId: "m1", topic: "StringBuilder", score: 28.6, correct: 2, total: 7, tier: "skill-gap", gap: 31 }
        ]}
      />
    );

    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("StringBuilder");
    expect(tip.textContent).toContain("29% (2 of 7 correct)");
    expect(tip.textContent).toContain("Target Competency60%");
    expect(tip.textContent).toContain("31 percentage points");
    expect(tip.textContent).toContain("Significant Skill Gap");
  });

  it("lists the four tiers with their ranges", () => {
    const { container } = render(
      <SkillGapAnalysis cutoff={60} tiers={tiers} skills={[{ moduleId: "m1", topic: "A", score: 90, tier: "strength", gap: 0 }]} />
    );
    const legend = container.querySelector(".sd-skills__legend").textContent;
    expect(legend).toContain("Strength80–100%");
    expect(legend).toContain("Needs Improvement40–59%");
  });
});

describe("CutoffEditor", () => {
  const classes = [{ id: "c1", name: "Section A", cutoff: 60 }];

  it("shows the class's cut-off on its button", () => {
    render(<CutoffEditor classes={classes} onSave={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Cut-off 60%" })).toBeTruthy();
  });

  it("saves a changed cut-off", async () => {
    const onSave = jest.fn(async () => {});
    render(<CutoffEditor classes={classes} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Cut-off 60%" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "70" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(onSave).toHaveBeenCalledWith("c1", 70);
  });

  it("refuses a cut-off outside 1 to 99", () => {
    render(<CutoffEditor classes={classes} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cut-off 60%" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "100" } });

    expect(screen.getByText("Use a whole number from 1 to 99.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
  });
});

describe("skill gap exam line", () => {
  it("names the exam and the day it was taken", () => {
    const { container } = render(
      <SkillGapAnalysis
        cutoff={60}
        tiers={tiers}
        exam={{ title: "CC2 Final Exam", takenAt: "2026-09-12T08:00:00Z" }}
        skills={[{ moduleId: "m1", topic: "A", score: 90, tier: "strength", gap: 0 }]}
      />
    );
    expect(container.querySelector(".sd-eyebrow").textContent).toBe("CC2 Final Exam · Taken 12 Sept 2026");
  });

  it("falls back to Final exam with no date", () => {
    const { container } = render(
      <SkillGapAnalysis cutoff={60} tiers={tiers} skills={[{ moduleId: "m1", topic: "A", score: 90, tier: "strength", gap: 0 }]} />
    );
    expect(container.querySelector(".sd-eyebrow").textContent).toBe("Final exam");
  });
});

describe("gapAdvice", () => {
  it("gives one evidence line and names the module for one failed topic", () => {
    const advice = gapAdvice([
      { topic: "StringBuilder", correct: 2, total: 7, gap: 31 },
      { topic: "Arrays", correct: 6, total: 7, gap: 0 }
    ]);
    expect(advice.evidence).toEqual([
      "2 of 7 StringBuilder-related questions answered correctly in the Final Exam"
    ]);
    expect(advice.recommendation).toBe("Review the StringBuilder module and retake the assessment.");
  });

  it("joins several failed topics with commas", () => {
    const advice = gapAdvice([
      { topic: "StringBuilder", correct: 2, total: 7, gap: 31 },
      { topic: "Loops", correct: 1, total: 5, gap: 40 }
    ]);
    expect(advice.evidence).toHaveLength(2);
    expect(advice.recommendation).toBe("Review the StringBuilder, Loops modules and retake the assessment.");
  });

  it("is null when nothing is under the cut-off", () => {
    expect(gapAdvice([{ topic: "A", correct: 7, total: 7, gap: 0 }])).toBeNull();
  });

  it("skips a topic the exam did not ask about", () => {
    expect(gapAdvice([{ topic: "A", correct: 0, total: 0, gap: 60 }])).toBeNull();
  });

  it("uses the score when there are no item counts", () => {
    const advice = gapAdvice([{ topic: "A", score: 30, correct: null, total: null, gap: 30 }]);
    expect(advice.evidence).toEqual(["30% on A-related questions in the Final Exam"]);
  });
});

describe("skill gap advice box", () => {
  it("shows Evidence and Recommendation under the list", () => {
    const { container } = render(
      <SkillGapAnalysis
        cutoff={60}
        tiers={tiers}
        skills={[{ moduleId: "m1", topic: "StringBuilder", score: 28.6, correct: 2, total: 7, tier: "skill-gap", gap: 31 }]}
      />
    );
    const box = container.querySelector(".sd-skills__list + .sd-skills__advice");
    expect(box.textContent).toContain("2 of 7 StringBuilder-related questions answered correctly in the Final Exam");
    expect(box.textContent).toContain("Review the StringBuilder module and retake the assessment.");
  });

  it("is hidden when every topic meets the cut-off", () => {
    const { container } = render(
      <SkillGapAnalysis cutoff={60} tiers={tiers} skills={[{ moduleId: "m1", topic: "A", score: 90, tier: "strength", gap: 0 }]} />
    );
    expect(container.querySelector(".sd-skills__advice")).toBeNull();
  });
});
