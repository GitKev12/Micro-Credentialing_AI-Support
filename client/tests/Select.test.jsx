import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Select } from "../src/components/Select.jsx";

/**
 * Which side a select's list hangs from.
 *
 * A list may grow wider than its trigger, because lesson titles are longer than
 * the fields they are picked in. Hung from the trigger's left edge, a select in
 * a right-hand column ran past the window — the generate screen's Lesson list
 * went off the screen and put a horizontal scrollbar on the whole page. The
 * list now measures itself as it opens and hangs from the right edge instead
 * when that is the roomier side.
 *
 * jsdom lays nothing out, so the geometry is given: the window is 1440 wide,
 * and each test places the trigger and says how wide the list came out.
 */

const OPTIONS = [
  { value: "m1", label: "1. Introduction to Object-Oriented Programming and Java Classes" },
  { value: "m2", label: "2. Inheritance" }
];

const Caret = () => null;

afterEach(() => {
  jest.restoreAllMocks();
});

function layOut({ trigger, listWidth }) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });

  jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
    const box = this.classList.contains("ui-select__list")
      ? { left: trigger.left, right: trigger.left + listWidth, top: 60, bottom: 300 }
      : { left: trigger.left, right: trigger.right, top: 20, bottom: 56 };
    return { ...box, width: box.right - box.left, height: box.bottom - box.top, x: box.left, y: box.top };
  });
}

const open = async () => {
  render(
    <Select value="m2" onChange={() => {}} options={OPTIONS} label="Lesson" CaretIcon={Caret} TickIcon={Caret} />
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Lesson" }));
  });
  return screen.getByRole("listbox");
};

describe("where a select's list hangs", () => {
  it("hangs from the left edge when it fits that way", async () => {
    layOut({ trigger: { left: 300, right: 620 }, listWidth: 400 });
    expect((await open()).dataset.align).toBe("start");
  });

  // The generate screen's Lesson field: a trigger in the right-hand column and
  // a list a good deal wider than it.
  it("hangs from the right edge when the left one would run it off the window", async () => {
    layOut({ trigger: { left: 1034, right: 1356 }, listWidth: 404 });
    expect((await open()).dataset.align).toBe("end");
  });

  /**
   * A list that fits neither way keeps to the side where more of it shows,
   * rather than being moved to where even less of it would.
   */
  it("stays put when the other side has even less room", async () => {
    layOut({ trigger: { left: 40, right: 1400 }, listWidth: 1500 });
    expect((await open()).dataset.align).toBe("start");
  });
});
