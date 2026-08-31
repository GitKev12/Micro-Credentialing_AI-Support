import { describe, it, expect, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// Recharts draws real SVG, so the chart is asserted on directly rather than
// through a mock. The one thing jsdom will not do is measure, and
// ResponsiveContainer sizes itself from a measurement — so it is handed one.
const BOX = { width: 320, height: 100 };

globalThis.ResizeObserver ??= class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ target, contentRect: { ...BOX, top: 0, left: 0 } }], this);
  }
  unobserve() {}
  disconnect() {}
};

for (const [prop, value] of [
  ["offsetWidth", BOX.width],
  ["offsetHeight", BOX.height],
  ["clientWidth", BOX.width],
  ["clientHeight", BOX.height]
]) {
  Object.defineProperty(window.HTMLElement.prototype, prop, {
    configurable: true,
    value
  });
}

let ScoreBarChart;
let plotRows;
let CourseCard;

beforeAll(async () => {
  ({ ScoreBarChart, plotRows } = await import("../src/components/ScoreBarChart.jsx"));
  ({ default: CourseCard } = await import("../src/pages/student/components/CourseCard.jsx"));
});

const bars = [
  { label: "1", score: 80, color: "--skill-strong", tooltip: "One — 80%" },
  { label: "2", score: 40, color: "--skill-weak", tooltip: "Two — 40%" }
];

const shapes = (container) => container.querySelectorAll(".recharts-bar-rectangle");

describe("plotRows", () => {
  it("clamps a score that arrives outside 0-100", () => {
    const rows = plotRows([{ score: 140 }, { score: -20 }, { score: null }, { score: "x" }]);
    expect(rows.map((row) => row.score)).toEqual([100, 0, 0, 0]);
  });

  it("keeps the caller's tooltip, and writes one when there is none", () => {
    const rows = plotRows([
      { label: "1", score: 80, tooltip: "Hardware — 80%" },
      { label: "2", score: 45.4 }
    ]);
    expect(rows[0].tooltip).toBe("Hardware — 80%");
    expect(rows[1].tooltip).toBe("2 45%");
  });
});

describe("ScoreBarChart", () => {
  it("draws one bar per row", () => {
    const { container } = render(<ScoreBarChart bars={bars} target={60} />);
    expect(shapes(container)).toHaveLength(2);
  });

  // `radius={[4,4,0,0]}` is the old `border-radius: 4px 4px 0 0` — rounded at
  // the data end, square at the baseline. Recharts draws a path, not a rect,
  // precisely because the corners differ.
  it("rounds the tops and leaves the feet square", () => {
    const { container } = render(<ScoreBarChart bars={bars} target={60} />);

    const path = container.querySelector(".recharts-bar-rectangle path");
    expect(path).not.toBeNull();
    // An arc for each top corner, and none at the bottom.
    expect((path.getAttribute("d").match(/A/g) ?? []).length).toBe(2);
  });

  it("draws the pass mark across the plot", () => {
    const { container } = render(<ScoreBarChart bars={bars} target={60} />);
    expect(container.querySelector(".recharts-reference-line")).not.toBeNull();
  });

  it("draws no pass mark when there is no threshold", () => {
    const { container } = render(<ScoreBarChart bars={bars} />);
    expect(container.querySelector(".recharts-reference-line")).toBeNull();
  });

  it("hides the axes on a plot too small to carry them", () => {
    const { container: bare } = render(<ScoreBarChart bars={bars} target={60} axes={false} />);
    const { container: full } = render(<ScoreBarChart bars={bars} target={60} axes />);

    expect(bare.querySelectorAll(".recharts-cartesian-axis")).toHaveLength(0);
    expect(full.querySelectorAll(".recharts-cartesian-axis").length).toBeGreaterThan(0);
  });

  it("gives every bar its own colour", () => {
    const { container } = render(
      <ScoreBarChart
        bars={[
          { label: "1", score: 80, color: "#0ca30c" },
          { label: "2", score: 40, color: "#d03b3b" }
        ]}
        target={60}
      />
    );

    const fills = [...container.querySelectorAll(".recharts-bar-rectangle path")].map((p) =>
      p.getAttribute("fill")
    );
    expect(fills).toEqual(["#0ca30c", "#d03b3b"]);
  });

  // SVG takes rgba, so the dark theme's translucent tokens go straight
  // through — no flattening, which the previous engine required.
  it("passes a translucent colour through untouched", () => {
    const { container } = render(
      <ScoreBarChart bars={[{ label: "1", score: 50, color: "rgba(255,255,255,0.3)" }]} />
    );

    expect(container.querySelector(".recharts-bar-rectangle path").getAttribute("fill")).toBe(
      "rgba(255,255,255,0.3)"
    );
  });

  it("describes itself for a screen reader, which cannot read the plot", () => {
    const { container } = render(
      <ScoreBarChart bars={bars} target={60} className="demo" ariaLabel="Two topics" />
    );

    const host = container.querySelector(".demo");
    expect(host.getAttribute("role")).toBe("img");
    expect(host.getAttribute("aria-label")).toBe("Two topics");
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

  const draw = (over = {}) =>
    render(
      <ul>
        <CourseCard course={{ ...course, ...over }} onOpen={() => {}} />
      </ul>
    );

  it("plots one bar per topic", () => {
    const { container } = draw();
    expect(shapes(container)).toHaveLength(2);
    expect(container.querySelector(".recharts-reference-line")).not.toBeNull();
  });

  it("keeps naming each topic for a screen reader", () => {
    const { container } = draw();
    expect(container.textContent).toContain("Hardware in Intro to Computing: 90 percent");
  });

  it("says so plainly when the exam has not been taken", () => {
    const { container } = draw({ skills: [] });
    expect(shapes(container)).toHaveLength(0);
    expect(container.textContent).toContain("Topic scores appear once");
  });
});
