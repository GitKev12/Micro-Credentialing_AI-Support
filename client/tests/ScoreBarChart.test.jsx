import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// The engine is fetched from gstatic and paints to a canvas, so the boundary
// worth testing is what it is handed — the rows and the options.
const charts = [];

jest.unstable_mockModule("react-google-charts", () => ({
  Chart: (props) => {
    charts.push(props);
    return <div data-testid="gchart" />;
  }
}));

let ScoreBarChart;
let CourseCard;

beforeAll(async () => {
  ({ ScoreBarChart } = await import("../src/components/ScoreBarChart.jsx"));
  ({ default: CourseCard } = await import("../src/pages/student/components/CourseCard.jsx"));
});

beforeEach(() => {
  charts.length = 0;
});

const last = () => charts[charts.length - 1];
const rows = () => last().data.slice(1);

const bars = [
  { label: "1", score: 80, color: "--skill-strong" },
  { label: "2", score: 40, color: "--skill-weak" }
];

describe("ScoreBarChart", () => {
  it("draws a combo chart, because the pass mark needs a line series", () => {
    render(<ScoreBarChart bars={bars} target={60} />);

    expect(last().chartType).toBe("ComboChart");
    expect(last().options.seriesType).toBe("bars");
    expect(last().options.series[1].type).toBe("line");
    expect(last().options.series[1].enableInteractivity).toBe(false);
  });

  it("pins the pass mark to the same value at every bar", () => {
    render(<ScoreBarChart bars={bars} target={60} />);

    expect(rows().map((row) => row[row.length - 1])).toEqual([60, 60]);
    expect(last().data[0][last().data[0].length - 1]).toBe("Pass mark");
  });

  it("carries no pass-mark series when there is no threshold", () => {
    render(<ScoreBarChart bars={bars} />);

    expect(last().options.series).toEqual({});
    expect(last().data[0]).toHaveLength(4);
  });

  // The two hand-written charts this replaced disagreed on clamping: one
  // rounded into 0-100, the other drew whatever arrived and overflowed.
  it("clamps a score that arrives outside 0-100", () => {
    render(
      <ScoreBarChart
        bars={[
          { label: "over", score: 140 },
          { label: "under", score: -20 },
          { label: "junk", score: null }
        ]}
      />
    );

    expect(rows().map((row) => row[1])).toEqual([100, 0, 0]);
  });

  // Colour is the one thing the library took away from CSS: a caller names a
  // token and the component resolves it off its own container, so the theme
  // still decides. A literal passes straight through, and an unresolvable
  // token falls back rather than handing Google Charts an empty string.
  it("passes a literal colour through untouched", () => {
    render(<ScoreBarChart bars={[{ label: "1", score: 50, color: "#123456" }]} />);
    expect(rows()[0][2]).toBe("#123456");
  });

  it("falls back to a real colour when a token cannot be resolved", () => {
    render(<ScoreBarChart bars={[{ label: "1", score: 50, color: "--not-a-token" }]} />);
    expect(rows()[0][2]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("gives every bar a tooltip, since the canvas says nothing on its own", () => {
    render(<ScoreBarChart bars={[{ label: "1", score: 80, tooltip: "Hardware — 80%" }]} />);

    expect(last().data[0][3]).toEqual({ role: "tooltip" });
    expect(rows()[0][3]).toBe("Hardware — 80%");
  });

  it("drops the axis furniture when the plot is too small to carry it", () => {
    render(<ScoreBarChart bars={bars} target={60} axes={false} height={74} />);

    expect(last().options.vAxis.textPosition).toBe("none");
    expect(last().options.hAxis.textPosition).toBe("none");
    expect(last().options.chartArea.width).toBe("100%");
    expect(last().height).toBe("74px");
  });

  it("holds the plot to 0-100 so two charts can be compared", () => {
    render(<ScoreBarChart bars={bars} target={60} />);

    expect(last().options.vAxis.viewWindow).toEqual({ min: 0, max: 100 });
  });
});

// The student card is the other caller.
describe("CourseCard, on the shared chart", () => {
  const course = {
    code: "IT 101",
    title: "Intro to Computing",
    performance: 72,
    skills: [
      { moduleId: "m1", topic: "Hardware", score: 90 },
      { moduleId: "m2", topic: "Software", score: 45 }
    ]
  };

  it("plots one bar per topic against the passing mark", () => {
    render(
      <ul>
        <CourseCard course={course} onOpen={() => {}} />
      </ul>
    );

    expect(rows().map((row) => row[1])).toEqual([90, 45]);
    expect(rows().map((row) => row[row.length - 1])).toEqual([60, 60]);
    expect(rows().every((row) => typeof row[2] === "string" && row[2].length > 0)).toBe(true);
  });

  it("keeps naming each topic for a screen reader", () => {
    const { container } = render(
      <ul>
        <CourseCard course={course} onOpen={() => {}} />
      </ul>
    );

    expect(container.textContent).toContain("Hardware in Intro to Computing: 90 percent");
  });

  it("says so plainly when the exam has not been taken", () => {
    const { container } = render(
      <ul>
        <CourseCard course={{ ...course, skills: [] }} onOpen={() => {}} />
      </ul>
    );

    expect(charts).toHaveLength(0);
    expect(container.textContent).toContain("Topic scores appear once");
  });
});
