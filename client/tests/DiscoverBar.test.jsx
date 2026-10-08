import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";

// react-router needs these, and jsdom doesn't have them.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const { render, screen, act, fireEvent, within } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

jest.unstable_mockModule("../src/assets/no-courses-student.png", () => ({ default: "" }));
jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ user: { id: "stu-1" } })
}));
jest.unstable_mockModule("../src/services/courses.js", () => ({ courseImageUrl: () => "" }));

const fetchDiscoverCourses = jest.fn();
jest.unstable_mockModule("../src/services/discover.js", () => ({ fetchDiscoverCourses }));

const { default: DiscoverPage } = await import("../src/pages/student/DiscoverPage.jsx");
const { matchesDiscover, NO_FILTERS } = await import("../src/pages/student/components/DiscoverBar.jsx");

const card = (extra) => ({
  id: "c1", code: "CC2", title: "Computer Programming 2", startsOn: "2026-09-01", endsOn: "2026-12-31",
  hasImage: false, sectionCount: 1, enrolled: false, pending: false, category: "Programming",
  openSections: [{ enrollment: "open", mode: "taught" }], ...extra
});

const COURSES = [
  card({ sectionCount: 2, openSections: [{ enrollment: "open", mode: "taught" }, { enrollment: "approval", mode: "assessOnly" }] }),
  card({ id: "c2", code: "OOP", title: "Object-Oriented Programming", enrolled: true, openSections: [{ enrollment: "open", mode: "assessOnly" }] }),
  card({ id: "c3", code: "TSM3", title: "Fundamentals of BPO", category: "Business & Service", openSections: [{ enrollment: "approval", mode: "taught" }] }),
  card({ id: "c4", code: "EA", title: "Enterprise Architecture", category: "", openSections: [{ enrollment: "approval", mode: "taught" }] })
];

async function show() {
  fetchDiscoverCourses.mockResolvedValue(COURSES);
  await act(async () => {
    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );
  });
}

const titles = () => screen.queryAllByRole("link").map((link) => link.textContent);

beforeEach(() => {
  fetchDiscoverCourses.mockReset();
});

describe("Discover search bar", () => {
  it("searches by course code or title, and says how many are left", async () => {
    await show();
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search courses" }), { target: { value: "bpo" } });

    expect(titles()).toEqual(["Fundamentals of BPO"]);
    expect(screen.getByRole("status").textContent).toBe("1 of 4 courses");
  });

  it("picks one category from the dropdown, with its course count", async () => {
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Category" }));
    const list = screen.getByRole("listbox", { name: "Category" });
    expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual([
      // A course with no category still counts under All categories.
      "All categories4",
      "Business & Service1",
      "Programming2"
    ]);

    fireEvent.click(within(list).getByRole("option", { name: /Business & Service/ }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Business & Service" })).toBeTruthy();
    expect(titles()).toEqual(["Fundamentals of BPO"]);
  });

  it("filters by my status, and counts the ticked boxes on the button", async () => {
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Enrolled" }));

    expect(titles()).toEqual(["Object-Oriented Programming"]);
    expect(screen.getByLabelText("1 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(titles()).toHaveLength(4);
  });

  it("matches Open and Assess-only on one section, not across two", async () => {
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Open" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Assess-only" }));

    // CC2 has an open section and an assess-only one, but no section that is both.
    expect(titles()).toEqual(["Object-Oriented Programming"]);
  });

  it("says so when nothing matches, and clears everything at once", async () => {
    await show();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search courses" }), { target: { value: "zzz" } });
    expect(screen.getByText("No courses match.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(screen.getByRole("searchbox", { name: "Search courses" }).value).toBe("");
    expect(titles()).toHaveLength(4);
  });

  it("closes a dropdown on Escape", async () => {
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByRole("dialog", { name: "Filter" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull();
  });
});

describe("matchesDiscover", () => {
  const none = { query: "", category: "", ticked: NO_FILTERS };

  it("lets everything through with nothing chosen", () => {
    expect(COURSES.every((course) => matchesDiscover(course, none))).toBe(true);
  });

  it("treats a group as any-of, and groups as all-of", () => {
    const ticked = { ...NO_FILTERS, status: ["none", "pending"], join: ["approval"] };
    expect(COURSES.filter((course) => matchesDiscover(course, { ...none, ticked })).map((c) => c.code)).toEqual(["CC2", "TSM3", "EA"]);
  });
});
