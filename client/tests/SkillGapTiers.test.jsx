import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent, act } from "@testing-library/react";

import SkillGapAnalysis from "../src/pages/student/components/SkillGapAnalysis.jsx";
import CutoffEditor from "../src/pages/assessor/components/CutoffEditor.jsx";

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
