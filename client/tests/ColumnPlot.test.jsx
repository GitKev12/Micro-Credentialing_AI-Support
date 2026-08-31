import { describe, it, expect, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let ColumnPlot;
let CourseCard;

beforeAll(async () => {
  ({ ColumnPlot } = await import("../src/components/ColumnPlot.jsx"));
  ({ default: CourseCard } = await import("../src/pages/student/components/CourseCard.jsx"));
});

const columns = [
  { key: "a", score: 80, band: "good" },
  { key: "b", score: 40, band: "critical" }
];

describe("ColumnPlot", () => {
  it("derives every class from the prefix, so a skin keeps its own CSS", () => {
    const { container } = render(<ColumnPlot prefix="demo" columns={columns} target={60} />);

    expect(container.querySelector(".demo")).not.toBeNull();
    expect(container.querySelector(".demo__plot")).not.toBeNull();
    expect(container.querySelector(".demo__target")).not.toBeNull();
    expect(container.querySelectorAll(".demo__col")).toHaveLength(2);
    expect(container.querySelectorAll(".demo__bar")).toHaveLength(2);
  });

  it("puts the hairline at the threshold and each bar at its score", () => {
    const { container } = render(<ColumnPlot prefix="demo" columns={columns} target={60} />);

    expect(container.querySelector(".demo__target").style.bottom).toBe("60%");
    const bars = container.querySelectorAll(".demo__bar");
    expect(bars[0].style.height).toBe("80%");
    expect(bars[1].style.height).toBe("40%");
  });

  // The bug the two hand-written copies could disagree on: one clamped, the
  // other drew whatever arrived and overflowed its plot.
  it("clamps a score that arrives outside 0-100", () => {
    const { container } = render(
      <ColumnPlot
        prefix="demo"
        columns={[
          { key: "over", score: 140 },
          { key: "under", score: -20 },
          { key: "junk", score: null }
        ]}
      />
    );

    const heights = [...container.querySelectorAll(".demo__bar")].map((bar) => bar.style.height);
    expect(heights).toEqual(["100%", "0%", "0%"]);
  });

  it("omits the hairline when there is no threshold to draw", () => {
    const { container } = render(<ColumnPlot prefix="demo" columns={columns} />);
    expect(container.querySelector(".demo__target")).toBeNull();
  });

  it("holds every bar at zero until it is grown", () => {
    const { container } = render(
      <ColumnPlot prefix="demo" columns={columns} target={60} grown={false} />
    );

    const heights = [...container.querySelectorAll(".demo__bar")].map((bar) => bar.style.height);
    expect(heights).toEqual(["0%", "0%"]);
  });

  it("renders the list and its items as the caller asks", () => {
    const { container } = render(<ColumnPlot prefix="demo" columns={columns} as="ul" item="li" />);

    expect(container.querySelector("ul.demo__plot")).not.toBeNull();
    expect(container.querySelectorAll("li.demo__col")).toHaveLength(2);
  });
});

// The student card is the other caller. It drives the same plot through the
// band ids and the 60% passing mark its own stylesheet is written against.
describe("CourseCard, on the shared plot", () => {
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

  it("draws one column per topic, banded, against the passing mark", () => {
    const { container } = draw();

    const plot = container.querySelector(".sd-cc-chart__plot");
    expect(plot.tagName).toBe("UL");
    expect(plot.querySelectorAll("li.sd-cc-chart__col")).toHaveLength(2);
    expect(container.querySelector(".sd-cc-chart__target").style.bottom).toBe("60%");

    // Band drives the colour token, so it has to reach the column element.
    const bands = [...plot.querySelectorAll(".sd-cc-chart__col")].map((col) =>
      col.getAttribute("data-band")
    );
    expect(new Set(bands).size).toBe(2);
  });

  it("keeps naming each topic for a screen reader", () => {
    const { container } = draw();
    expect(container.textContent).toContain("Hardware in Intro to Computing: 90 percent");
  });

  it("says so plainly when the exam has not been taken", () => {
    const { container } = draw({ skills: [] });
    expect(container.querySelector(".sd-cc-chart")).toBeNull();
    expect(container.textContent).toContain("No topic scores yet.");
  });
});
