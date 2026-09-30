import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import GenerationProgress from "../src/pages/assessor/components/GenerationProgress";

const bar = () => screen.getByRole("progressbar");

describe("GenerationProgress", () => {
  it("counts lessons landed out of lessons planned", () => {
    render(
      <GenerationProgress
        scope="final"
        progress={{ stage: "writing", total: 13, done: 4, written: [], writing: [] }}
      />
    );

    expect(screen.getByText("4 of 13 lessons")).toBeInTheDocument();
    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-valuenow", "31");
  });

  it("names the lessons in flight and the ones already written", () => {
    render(
      <GenerationProgress
        scope="final"
        progress={{
          stage: "writing",
          total: 13,
          done: 2,
          written: ["Looping", "Arrays"],
          writing: ["Using Data"]
        }}
      />
    );

    expect(screen.getByText(/Using Data/)).toBeInTheDocument();
    expect(screen.getByText(/Looping · Arrays/)).toBeInTheDocument();
  });

  it("gives a quiz no percentage, because one call has none to give", () => {
    render(
      <GenerationProgress
        scope="lesson"
        progress={{ stage: "writing", total: 1, done: 0, written: [], writing: [] }}
      />
    );

    expect(screen.getByText("Writing questions")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(bar()).not.toHaveAttribute("aria-valuenow");
  });

  it("reads the stages that are not writing", () => {
    const { rerender } = render(
      <GenerationProgress scope="final" progress={{ stage: "reading", total: 0, done: 0 }} />
    );
    expect(screen.getByText("Reading the lesson text")).toBeInTheDocument();

    rerender(
      <GenerationProgress scope="final" progress={{ stage: "checking", total: 13, done: 13 }} />
    );
    expect(screen.getByText("Checking the questions")).toBeInTheDocument();
    // Every lesson is written by now, so the bar is full and honestly so.
    expect(bar()).toHaveAttribute("aria-valuenow", "100");
  });

  it("stands up before the first poll comes back", () => {
    render(<GenerationProgress scope="final" progress={null} />);
    expect(screen.getByText("Writing the final exam")).toBeInTheDocument();
    expect(screen.getByText("Reading the lesson text")).toBeInTheDocument();
  });

  it("names the paper it is writing", () => {
    const { rerender } = render(<GenerationProgress scope="lesson" progress={null} />);
    expect(screen.getByText("Writing the quiz")).toBeInTheDocument();

    rerender(<GenerationProgress scope="final" progress={null} />);
    expect(screen.getByText("Writing the final exam")).toBeInTheDocument();
  });

  it("never reports more than a full bar", () => {
    render(
      <GenerationProgress
        scope="final"
        progress={{ stage: "writing", total: 3, done: 5, written: [], writing: [] }}
      />
    );
    expect(bar()).toHaveAttribute("aria-valuenow", "100");
  });
});
