import { describe, it, expect } from "@jest/globals";

import { classTitle, sectionOptions, SECTIONS } from "../src/pages/admin/components/classes/classText";

/**
 * What a class is called when it was not named.
 *
 * The section is optional, so a class may reach every list without one. It has
 * to be called something there: a blank cell reads as a row that failed to
 * load, not as a class nobody gave a section to.
 */

describe("sectionOptions — what the form offers", () => {
  it("offers the four sections and a way to choose none", () => {
    expect(sectionOptions.map((option) => option.value)).toEqual([
      "",
      "Section-A",
      "Section-B",
      "Section-C",
      "Section-D"
    ]);
  });

  it("names the empty choice rather than leaving it blank", () => {
    // Listed, not left to a placeholder: having no section is an answer, and a
    // picked section has to be undoable.
    expect(sectionOptions[0].label).toBe("No section");
    expect(sectionOptions[0].value).toBe("");
  });

  it("lists every section it declares", () => {
    expect(sectionOptions.slice(1).map((option) => option.label)).toEqual(SECTIONS);
  });
});

describe("classTitle — what an unnamed class is called", () => {
  it("uses the section when there is one", () => {
    expect(classTitle({ name: "Section-B", course: { code: "CC2" } })).toBe("Section-B");
  });

  it("falls back to the course code when there is not", () => {
    expect(classTitle({ name: "", course: { code: "CC2", title: "Computer Programming 2" } })).toBe(
      "CC2"
    );
  });

  it("treats a name of only spaces as no name", () => {
    expect(classTitle({ name: "   ", course: { code: "CC2" } })).toBe("CC2");
  });

  it("falls back to the course title where a course carries no code", () => {
    expect(classTitle({ name: "", course: { title: "Computer Programming 2" } })).toBe(
      "Computer Programming 2"
    );
  });

  it("still says something for a class that did not load", () => {
    expect(classTitle({})).toBe("Unnamed class");
    expect(classTitle(null)).toBe("Unnamed class");
  });
});
