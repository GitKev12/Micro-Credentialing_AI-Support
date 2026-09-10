import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen, within } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  clearAuthSession: () => {}
}));

let AssessorSidebar, MemoryRouter;

beforeAll(async () => {
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ default: AssessorSidebar } = await import(
    "../src/pages/assessor/components/AssessorSidebar.jsx"
  ));
});

const draw = (counts) =>
  render(
    <MemoryRouter>
      <AssessorSidebar name="Ana Cruz" idNumber="ASS001" counts={counts} />
    </MemoryRouter>
  );

const link = (label) => screen.getByRole("link", { name: new RegExp(label) });

/**
 * The two numbers on the rail.
 *
 * Both are work waiting on this assessor, which is the only reason a count
 * belongs beside a name: papers nobody has posted yet, and passes nobody has
 * issued yet. The other two sections are places to look at things, and a
 * number on one of those would just be a size.
 */
describe("the counts on the sidebar", () => {
  it("says how many papers are unposted and how many passes are waiting", () => {
    draw({ toPost: 4, credentials: 2 });

    expect(within(link("Generate Assessment")).getByText("4")).toBeInTheDocument();
    expect(within(link("Credentials")).getByText("2")).toBeInTheDocument();
  });

  /**
   * Nothing waiting is not news. A nought sitting in a badge reads as a thing
   * to attend to from across the room, which is the opposite of what it says.
   */
  it("shows no badge where there is nothing waiting", () => {
    draw({ toPost: 0, credentials: 0 });

    expect(within(link("Generate Assessment")).queryByText("0")).not.toBeInTheDocument();
    expect(within(link("Credentials")).queryByText("0")).not.toBeInTheDocument();
  });

  // The rail is drawn before the overview call comes back, and on a failed one
  // it is never filled in at all.
  it("draws every section before any count has arrived", () => {
    draw(null);

    ["My Classes", "Generate Assessment", "Results", "Credentials"].forEach((label) => {
      expect(link(label)).toBeInTheDocument();
    });
  });
});
