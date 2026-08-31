import { describe, it, expect, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, fireEvent } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let RangeCalendar, nextRange;

beforeAll(async () => {
  const module = await import("../src/pages/admin/components/RangeCalendar.jsx");
  RangeCalendar = module.default;
  nextRange = module.nextRange;
});

// A fixed run, so nothing here depends on the day the suite is run: August 2026
// starts on a Saturday, which puts the grid's first cell on 26 July.
const RUN = { startsOn: "2026-08-04", endsOn: "2026-08-12" };

// The grid lives behind a trigger now, so every grid test opens it first.
const draw = (props = {}) => {
  const onChange = props.onChange ?? (() => {});
  const view = render(<RangeCalendar {...RUN} {...props} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Course duration/ }));
  return view;
};

/** Renders without opening — for the closed field's own behaviour. */
const drawClosed = (props = {}) => {
  const onChange = props.onChange ?? (() => {});
  return render(<RangeCalendar {...RUN} {...props} onChange={onChange} />);
};

const trigger = () => screen.getByRole("button", { name: /Course duration/ });

const day = (container, key) => container.querySelector(`[data-day="${key}"]`);

describe("nextRange — what a click makes of the run", () => {
  it("starts a run on the first day chosen", () => {
    expect(nextRange({ startsOn: "", endsOn: "" }, "2026-08-04")).toEqual({
      startsOn: "2026-08-04",
      endsOn: ""
    });
  });

  it("closes it on the second", () => {
    expect(nextRange({ startsOn: "2026-08-04", endsOn: "" }, "2026-10-10")).toEqual({
      startsOn: "2026-08-04",
      endsOn: "2026-10-10"
    });
  });

  // The native pair let the end be set before the start and complained
  // afterwards. Here the two days are simply read in the order they fall.
  it("turns the pair round rather than refusing a day before the start", () => {
    expect(nextRange({ startsOn: "2026-10-10", endsOn: "" }, "2026-08-04")).toEqual({
      startsOn: "2026-08-04",
      endsOn: "2026-10-10"
    });
  });

  it("begins again once a whole run is there", () => {
    expect(nextRange({ startsOn: "2026-08-04", endsOn: "2026-10-10" }, "2026-09-01")).toEqual({
      startsOn: "2026-09-01",
      endsOn: ""
    });
  });

  // A course that starts and ends on the same day is one day long, which is
  // the same reading `hasCourseEnded` takes.
  it("allows a run of a single day", () => {
    expect(nextRange({ startsOn: "2026-08-04", endsOn: "" }, "2026-08-04")).toEqual({
      startsOn: "2026-08-04",
      endsOn: "2026-08-04"
    });
  });
});

describe("RangeCalendar — the grid", () => {
  it("draws six weeks, so the panel is the same height in every month", () => {
    const { container } = draw();

    expect(container.querySelectorAll(".admin-cal__day")).toHaveLength(42);
    expect(container.querySelectorAll('[role="row"]')).toHaveLength(6);
    expect(day(container, "2026-07-26")).toBeTruthy();
    expect(day(container, "2026-09-05")).toBeTruthy();
  });

  // The whole library reads and writes the day rather than the hour, so a cell
  // must be numbered by its UTC date: in a local-time grid a reader west of
  // Greenwich would be offered the 4th and would save the 3rd.
  it("numbers a cell by its UTC day", () => {
    const { container } = draw();

    expect(day(container, "2026-08-04").querySelector('[aria-hidden="true"]').textContent).toBe(
      "4"
    );
    expect(day(container, "2026-08-31").querySelector('[aria-hidden="true"]').textContent).toBe(
      "31"
    );
  });

  it("paints the span, capped at both ends", () => {
    const { container } = draw();

    expect(day(container, "2026-08-04").className).toContain("is-start");
    expect(day(container, "2026-08-12").className).toContain("is-end");
    // The 5th to the 11th — everything strictly inside the pair.
    expect(container.querySelectorAll(".admin-cal__day.is-between")).toHaveLength(7);
  });

  it("marks the days either side of the month without dropping them", () => {
    const { container } = draw();

    expect(day(container, "2026-07-31").className).toContain("is-outside");
    expect(day(container, "2026-08-01").className).not.toContain("is-outside");
  });

  it("reports the day that was clicked", () => {
    const picks = [];
    const { container } = draw({ endsOn: "", onChange: (run) => picks.push(run) });

    fireEvent.click(day(container, "2026-08-20"));

    expect(picks).toEqual([{ startsOn: "2026-08-04", endsOn: "2026-08-20" }]);
  });

  it("asks for the day it still needs", () => {
    draw({ endsOn: "" });

    expect(screen.getByText("Choose the last day")).toBeTruthy();
  });
});

describe("RangeCalendar — keyboard", () => {
  const grid = (container) => container.querySelector(".admin-cal__grid");

  it("keeps one tab stop and moves it with the arrows", () => {
    const { container } = draw();

    expect(day(container, "2026-08-04").getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(grid(container), { key: "ArrowRight" });
    expect(day(container, "2026-08-05").getAttribute("tabindex")).toBe("0");
    expect(day(container, "2026-08-04").getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(grid(container), { key: "ArrowDown" });
    expect(day(container, "2026-08-12").getAttribute("tabindex")).toBe("0");
  });

  it("runs Home and End along the week", () => {
    const { container } = draw();

    fireEvent.keyDown(grid(container), { key: "End" });
    // 4 August 2026 is a Tuesday, so its week ends on the 8th.
    expect(day(container, "2026-08-08").getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(grid(container), { key: "Home" });
    expect(day(container, "2026-08-02").getAttribute("tabindex")).toBe("0");
  });

  it("pages by month, and by year with shift", () => {
    const { container } = draw();

    fireEvent.keyDown(grid(container), { key: "PageDown" });
    expect(day(container, "2026-09-04")).toBeTruthy();

    fireEvent.keyDown(grid(container), { key: "PageDown", shiftKey: true });
    expect(day(container, "2027-09-04")).toBeTruthy();
  });

  it("chooses the focused day on Enter", () => {
    const picks = [];
    const { container } = draw({ endsOn: "", onChange: (run) => picks.push(run) });

    fireEvent.keyDown(grid(container), { key: "ArrowRight" });
    fireEvent.keyDown(grid(container), { key: "Enter" });

    expect(picks).toEqual([{ startsOn: "2026-08-04", endsOn: "2026-08-05" }]);
  });
});

describe("RangeCalendar — paging with the buttons", () => {
  it("names the month it moves to", () => {
    const { container } = draw();

    fireEvent.click(screen.getByLabelText("Next month"));
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("September 2026");
    expect(day(container, "2026-09-15")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Previous month"));
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("August 2026");
  });
});

// Six weeks of cells standing permanently in a form is most of a modal spent
// on one field, so the grid only exists while it is being used.
describe("RangeCalendar — the dropdown", () => {
  it("stays shut until it is asked for", () => {
    const { container } = drawClosed();

    expect(container.querySelector(".admin-cal__grid")).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger());
    expect(container.querySelector(".admin-cal__grid")).toBeTruthy();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("carries the run on the trigger, so the field reads as a field when shut", () => {
    drawClosed();

    expect(trigger().textContent).toContain("Aug 4 – Aug 12, 2026 · 1 week");
  });

  it("says what it wants when there is no run yet", () => {
    drawClosed({ startsOn: "", endsOn: "" });

    expect(trigger().textContent).toContain("Choose the course duration");
  });

  it("opens on the down arrow, the way the console's other dropdowns do", () => {
    const { container } = drawClosed();

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });

    expect(container.querySelector(".admin-cal__grid")).toBeTruthy();
  });

  it("shuts on Escape", () => {
    const { container } = draw();

    fireEvent.keyDown(container.querySelector(".admin-cal__grid"), { key: "Escape" });

    expect(container.querySelector(".admin-cal__grid")).toBeNull();
  });

  // This field lives in a modal that closes itself on a window-level Escape.
  // Without stopping here, dismissing the calendar took the form down with it
  // and threw away every other field on the way.
  it("keeps Escape to itself, so the form around it survives", () => {
    let escapedToWindow = false;
    const listener = () => {
      escapedToWindow = true;
    };
    window.addEventListener("keydown", listener);

    try {
      const { container } = draw();
      fireEvent.keyDown(container.querySelector(".admin-cal__grid"), { key: "Escape" });

      expect(container.querySelector(".admin-cal__grid")).toBeNull();
      expect(escapedToWindow).toBe(false);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });

  // Closed, it is an ordinary field again: Escape belongs to the form.
  it("lets Escape through once it is shut", () => {
    let escapedToWindow = false;
    const listener = () => {
      escapedToWindow = true;
    };
    window.addEventListener("keydown", listener);

    try {
      drawClosed();
      fireEvent.keyDown(trigger(), { key: "Escape" });

      expect(escapedToWindow).toBe(true);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });

  it("shuts on a click outside it", () => {
    const { container } = draw();

    fireEvent.mouseDown(document.body);

    expect(container.querySelector(".admin-cal__grid")).toBeNull();
  });

  // The whole run is the answer the field was opened for; the first of the two
  // days is not, so choosing it leaves the grid up.
  // Opened on a whole run, so the month in view is August 2026 whatever day the
  // suite is run on — a grid opened with no run at all lands on today's month.
  it("stays open on a click that only starts a run", () => {
    const { container } = draw();

    // A complete run is already set, so this begins a new one: half an answer.
    fireEvent.click(day(container, "2026-08-20"));

    expect(container.querySelector(".admin-cal__grid")).toBeTruthy();
  });

  it("shuts on the day that completes the run", () => {
    const { container } = draw({ endsOn: "" });

    fireEvent.click(day(container, "2026-08-20"));

    expect(container.querySelector(".admin-cal__grid")).toBeNull();
  });

  it("clears the run without closing", () => {
    const picks = [];
    const { container } = draw({ onChange: (run) => picks.push(run) });

    fireEvent.click(screen.getByText("Clear"));

    expect(picks).toEqual([{ startsOn: "", endsOn: "" }]);
    expect(container.querySelector(".admin-cal__grid")).toBeTruthy();
  });

  it("offers nothing to clear when there is no run", () => {
    draw({ startsOn: "", endsOn: "" });

    expect(screen.queryByText("Clear")).toBeNull();
  });
});
