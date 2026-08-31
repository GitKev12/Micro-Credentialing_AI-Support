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
let opaque;
let parseColor;
let CourseCard;

beforeAll(async () => {
  ({ ScoreBarChart, opaque, parseColor } = await import("../src/components/ScoreBarChart.jsx"));
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
  it("draws a plain column chart", () => {
    render(<ScoreBarChart bars={bars} target={60} />);
    expect(last().chartType).toBe("ColumnChart");
  });

  // A line series only spans the first bar's centre to the last one's, so it
  // stopped short of both edges. The gridline runs the full plot width, which
  // is where the hand-drawn hairline sat.
  it("draws the pass mark as a full-width gridline, not a series", () => {
    render(<ScoreBarChart bars={bars} target={60} />);

    expect(last().options.vAxis.ticks).toEqual([{ v: 60, f: "60%" }]);
    expect(last().options.vAxis.gridlines.color).not.toBe("transparent");
    expect(last().options.series).toBeUndefined();
    // No extra column smuggled into every row for it.
    expect(last().data[0]).toHaveLength(4);
    expect(rows()[0]).toHaveLength(4);
  });

  it("draws no gridline at all when there is no threshold", () => {
    render(<ScoreBarChart bars={bars} />);

    expect(last().options.vAxis.ticks).toEqual([]);
    expect(last().options.vAxis.gridlines.color).toBe("transparent");
  });

  // The hand-drawn columns capped at 22px so a short course did not draw
  // slabs; the group width is where Google Charts takes that.
  it("caps the bar width where the caller asks", () => {
    render(<ScoreBarChart bars={bars} target={60} barWidth={22} />);
    expect(last().options.bar.groupWidth).toBe(22);
  });

  it("rounds the bar tops once the engine is ready", () => {
    render(<ScoreBarChart bars={bars} target={60} />);

    const ready = last().chartEvents.find((e) => e.eventName === "ready");
    expect(ready).toBeDefined();
    expect(typeof ready.callback).toBe("function");
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
  it("passes a literal colour through, normalised to a form the engine takes", () => {
    render(<ScoreBarChart bars={[{ label: "1", score: 50, color: "#123456" }]} />);
    expect(rows()[0][2]).toBe("rgb(18, 52, 86)");
  });

  it("falls back to a real colour when a token cannot be resolved", () => {
    render(<ScoreBarChart bars={[{ label: "1", score: 50, color: "--not-a-token" }]} />);
    expect(rows()[0][2]).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it("never hands the engine an rgba value, whatever the theme resolves to", () => {
    render(<ScoreBarChart bars={[{ label: "1", score: 50, color: "rgba(255,255,255,0.3)" }]} target={60} />);

    expect(rows()[0][2]).not.toMatch(/rgba/);
    expect(last().options.vAxis.gridlines.color).not.toMatch(/rgba/);
    expect(last().options.vAxis.textStyle.color).not.toMatch(/rgba/);
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

// Google Charts parses colours itself and rejects rgba() — "Invalid color:
// rgba(255, 255, 255, 0.30)", which is exactly the dark theme's hairline
// token. Verified against the live engine: it takes hex and rgb(), not rgba().
describe("opaque", () => {
  it("reads the colour forms the stylesheet actually produces", () => {
    expect(parseColor("#d03b3b")).toEqual([208, 59, 59, 1]);
    expect(parseColor("#abc")).toEqual([170, 187, 204, 1]);
    expect(parseColor("rgb(12, 163, 12)")).toEqual([12, 163, 12, 1]);
    expect(parseColor("rgba(255, 255, 255, 0.30)")).toEqual([255, 255, 255, 0.3]);
    expect(parseColor("chartreuse")).toBeNull();
  });

  it("composites a translucent token onto the surface under it", () => {
    // The dark theme's hairline: 30% white over the navy card #121e2d, so
    // each channel is c*0.7 + 255*0.3 — blue lands at 45*0.7 + 76.5 = 108.
    expect(opaque("rgba(255, 255, 255, 0.30)", "#121e2d")).toBe("rgb(89, 98, 108)");
  });

  it("hands an opaque colour back as rgb, never as rgba", () => {
    expect(opaque("#d03b3b", "#ffffff")).toBe("rgb(208, 59, 59)");
    expect(opaque("rgba(12, 163, 12, 1)", "#ffffff")).toBe("rgb(12, 163, 12)");
  });

  it("leaves a keyword alone, because the engine knows those", () => {
    expect(opaque("transparent", "#ffffff")).toBe("transparent");
  });

  it("falls back to white when the surface itself cannot be read", () => {
    expect(opaque("rgba(0, 0, 0, 0.5)", "not-a-colour")).toBe("rgb(128, 128, 128)");
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
    expect(last().options.vAxis.ticks).toEqual([{ v: 60, f: "60%" }]);
    expect(last().options.bar.groupWidth).toBe(22);
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
