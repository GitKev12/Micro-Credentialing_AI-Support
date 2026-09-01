import { describe, it, expect, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { render, screen } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let PageHeader, SectionTitle, StatTile, CoursesIcon, BadgeIcon;

beforeAll(async () => {
  ({ PageHeader, SectionTitle, StatTile } = await import(
    "../src/pages/admin/components/ui.jsx"
  ));
  ({ CoursesIcon, BadgeIcon } = await import("../src/pages/admin/components/icons.jsx"));
});

describe("PageHeader — the section's mark", () => {
  it("carries the glyph beside the title", () => {
    const { container } = render(<PageHeader title="Courses Management" icon={CoursesIcon} />);

    expect(container.querySelector(".admin-header__mark svg")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Courses Management");
  });

  // The heading beside it already says the name, so the glyph must not be a
  // second thing to read out.
  it("hides the mark from a screen reader", () => {
    const { container } = render(<PageHeader title="Courses Management" icon={CoursesIcon} />);

    expect(container.querySelector(".admin-header__mark").getAttribute("aria-hidden")).toBe("true");
  });

  it("still renders without one, for a header that has no section", () => {
    const { container } = render(<PageHeader title="Edit course" />);

    expect(container.querySelector(".admin-header__mark")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("keeps the subtitle and the action it always had", () => {
    render(
      <PageHeader
        title="Courses Management"
        icon={CoursesIcon}
        subtitle="8 courses"
        action={<button type="button">New course</button>}
      />
    );

    expect(screen.getByText("8 courses")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New course" })).toBeTruthy();
  });
});

describe("SectionTitle — a card's mark", () => {
  it("puts the glyph before the heading it belongs to", () => {
    const { container } = render(<SectionTitle icon={CoursesIcon}>Assigned Courses</SectionTitle>);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Assigned Courses");
    expect(container.querySelector(".admin-card__title-mark svg")).toBeTruthy();
    expect(container.querySelector(".admin-card__title-mark").getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("keeps the class the card styles are written against", () => {
    const { container } = render(<SectionTitle icon={CoursesIcon}>Enrolled Courses</SectionTitle>);

    expect(container.querySelector(".admin-card__title")).toBeTruthy();
  });
});

describe("StatTile — the mark for what is counted", () => {
  it("leads the label with the glyph, and leaves the label the only text", () => {
    const { container } = render(<StatTile icon={BadgeIcon} value={4} label="Badges earned" />);

    const label = container.querySelector(".admin-stat__label");
    expect(label.textContent).toBe("Badges earned");
    expect(label.firstChild).toBe(container.querySelector(".admin-stat__mark"));
    expect(container.querySelector(".admin-stat__mark svg")).toBeTruthy();
    expect(container.querySelector(".admin-stat__mark").getAttribute("aria-hidden")).toBe("true");
  });

  // CoursesIcon is the nav's too, where it is drawn at 20. The tile has to
  // override that, or one row of tiles would carry two sizes of glyph.
  it("draws every glyph at the label's size, whatever the icon's own default", () => {
    const { container } = render(<StatTile icon={CoursesIcon} value={2} label="Active courses" />);

    expect(container.querySelector(".admin-stat__mark svg").getAttribute("width")).toBe("15");
  });

  it("still renders the figure, label and note without an icon", () => {
    const { container } = render(<StatTile value={9} label="Micro-credentials" note="1 issued" />);

    expect(container.querySelector(".admin-stat__mark")).toBeNull();
    expect(container.querySelector(".admin-stat__value").textContent).toBe("9");
    expect(screen.getByText("Micro-credentials")).toBeTruthy();
    expect(screen.getByText("1 issued")).toBeTruthy();
  });
});
