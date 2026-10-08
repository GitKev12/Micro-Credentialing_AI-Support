import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act, fireEvent } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { displayName: "Ana Cruz", studentNumber: "2021-0001" } }),
  clearAuthSession: jest.fn()
}));
jest.unstable_mockModule("../src/services/avatar.js", () => ({
  resolveAvatarUrl: () => "",
  getInitials: () => "AC"
}));

const { default: StudentNavBar } = await import("../src/pages/student/components/StudentNavBar.jsx");

/** jsdom has no matchMedia; without one the bar draws its desktop form. */
function asDrawer(matches) {
  window.matchMedia = (query) => ({
    matches,
    media: query,
    addEventListener() {},
    removeEventListener() {}
  });
}

async function show() {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={["/student"]}>
        <StudentNavBar />
      </MemoryRouter>
    );
  });
}

const labels = () =>
  [...document.querySelectorAll(".sd-menu__item")].map((item) => item.textContent.trim());

beforeEach(() => {
  delete window.matchMedia;
});

afterEach(() => {
  delete window.matchMedia;
});

describe("Student account menu", () => {
  it("offers the achievements the bar has no room for, and not the bar's own links", async () => {
    await show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Account menu for Ana Cruz" }));
    });

    // The three section links are in the bar right above it, so the dropdown
    // carries only what the bar cannot reach.
    expect(labels()).toEqual(["Certification", "Badges", "Dark mode", "Log out"]);
  });

  it("keeps the section links in the drawer, where the bar is hidden", async () => {
    asDrawer(true);
    await show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Menu for Ana Cruz" }));
    });

    expect(labels()).toEqual([
      "My Courses",
      "Discover",
      "Dashboard",
      "Certification",
      "Badges",
      "Dark mode",
      "Log out"
    ]);
  });

  it("sends the student to the certifications page", async () => {
    await show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Account menu for Ana Cruz" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Certification" }));
    });

    expect(document.querySelector(".sd-menu")).toBeNull();
  });
});
