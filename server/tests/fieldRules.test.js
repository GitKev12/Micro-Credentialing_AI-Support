import { describe, it, expect } from "@jest/globals";
import {
  MAX_LENGTH,
  checkCourseCode,
  checkCourseTitle,
  checkEmail,
  checkLength,
  checkName
} from "../src/lib/fieldRules.js";

/* Each field has a longest allowed value, so a pasted wall of text isn't saved. */

const many = (count, letter = "a") => letter.repeat(count);

describe("longest allowed values", () => {
  it("refuses a name past the limit and keeps one at it", () => {
    expect(checkName(many(MAX_LENGTH.name), "First name")).toBeNull();
    expect(checkName(many(MAX_LENGTH.name + 1), "First name")).toBe("First name can be at most 60 characters.");
  });

  it("refuses an email past the limit", () => {
    expect(checkEmail(`${many(250)}@x.ph`)).toBe("Email can be at most 254 characters.");
  });

  it("refuses a course code and title past the limit", () => {
    expect(checkCourseCode(many(21, "A"))).toBe("Course code can be at most 20 characters.");
    expect(checkCourseTitle(many(121))).toBe("Course title can be at most 120 characters.");
  });

  it("checks any other field with checkLength", () => {
    expect(checkLength(many(150), "A lesson title", MAX_LENGTH.lessonTitle)).toBeNull();
    expect(checkLength(many(151), "A lesson title", MAX_LENGTH.lessonTitle)).toBe(
      "A lesson title can be at most 150 characters."
    );
    expect(checkLength(undefined, "Room", MAX_LENGTH.schedule)).toBeNull();
  });
});
