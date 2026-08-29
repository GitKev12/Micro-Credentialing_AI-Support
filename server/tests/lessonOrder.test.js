import { describe, it, expect } from "@jest/globals";
import { byLesson, lessonNumber, numberIn, sortLessons } from "../src/lib/lessonOrder.js";

const titles = (modules) => modules.map((module) => module.title);

/** A lesson as the database holds it: a topic title and the file it came from. */
const lesson = (title, fileName) => ({ title, fileName });

describe("lessonNumber", () => {
  // Every course in this system names its files this way, and none of them put
  // the chapter in the title.
  it("reads the chapter out of the file name", () => {
    expect(lessonNumber(lesson("Creating Java Programs", "CC2-Lec-Chapter-1-Module.pdf"))).toBe(1);
    expect(
      lessonNumber(lesson("Customer Retention", "MODULE-SERVICE-CULTURE-CHAPTER-10.pdf"))
    ).toBe(10);
    expect(lessonNumber(lesson("Polymorphism", "OOP-Module-13.pdf"))).toBe(13);
  });

  it("ignores the numbers the prefixes carry", () => {
    // The course code (CC2, TSM3) and the revision date both hold numbers that
    // are not the chapter, which is why it is the last one that counts.
    expect(lessonNumber(lesson("Enterprise Systems", "UPDATED-AUGUST-3-2021-CHAPTER-6.pdf"))).toBe(6);
    expect(lessonNumber(lesson("Business Mapping", "TSM3-Module-Week2.pdf"))).toBe(2);
  });

  it("drops a re-download's copy marker before reading the chapter", () => {
    expect(lessonNumber(lesson("Introduction to QMS", "TSM3-Module-Week1 (1).pdf"))).toBe(1);
    expect(lessonNumber(lesson("Business Mapping", "TSM3-Module-Week2 (3).pdf"))).toBe(2);
  });

  it("falls back to the title when the file name has no number", () => {
    expect(lessonNumber(lesson("Chapter 4 — Arrays", "arrays.pdf"))).toBe(4);
    expect(lessonNumber("CC2 Lec Chapter 3 Module")).toBe(3);
  });

  it("sends a lesson that names no chapter to the end", () => {
    expect(lessonNumber(lesson("Course Orientation", "orientation.pdf"))).toBe(Infinity);
    expect(lessonNumber(null)).toBe(Infinity);
  });
});

describe("sortLessons", () => {
  it("puts a course in the order it is taught, not in alphabetical order", () => {
    const modules = [
      lesson("Arrays", "CC2-Lec-Chapter-8-Module.pdf"),
      lesson("Creating Java Programs", "CC2-Lec-Chapter-1-Module.pdf"),
      lesson("Looping", "CC2-Lec-Chapter-6-Module.pdf"),
      lesson("Using Data", "CC2-Lec-Chapter-2-Module.pdf")
    ];

    expect(titles(sortLessons(modules))).toEqual([
      "Creating Java Programs",
      "Using Data",
      "Looping",
      "Arrays"
    ]);
  });

  it("puts chapter 10 after chapter 2, which text order does not", () => {
    const modules = [
      lesson("Technology and Customer Service", "MODULE-SERVICE-CULTURE-CHAPTER-11.pdf"),
      lesson("Problem Solving", "MODULE-SERVICE-CULTURE-CHAPTER-3.pdf"),
      lesson("Customer Retention", "MODULE-SERVICE-CULTURE-CHAPTER-10.pdf")
    ];

    expect(titles(sortLessons(modules))).toEqual([
      "Problem Solving",
      "Customer Retention",
      "Technology and Customer Service"
    ]);
  });

  it("keeps a week range in sequence with the single weeks around it", () => {
    const modules = [
      lesson("Content Management", "EA-week-13.pdf"),
      lesson("Service-Oriented Architecture", "EA-week-1-2.pdf"),
      lesson("Business Continuity", "EA-week-10-11.pdf"),
      lesson("Open-Source Software", "EA-week-8.pdf")
    ];

    expect(titles(sortLessons(modules))).toEqual([
      "Service-Oriented Architecture",
      "Open-Source Software",
      "Business Continuity",
      "Content Management"
    ]);
  });

  it("leaves the unnumbered ones at the end, in name order", () => {
    const modules = [
      lesson("Syllabus", "syllabus.pdf"),
      lesson("Introduction to Systems Thinking", "MODULE-CHAPTER-1.pdf"),
      lesson("Orientation", "orientation.pdf")
    ];

    expect(titles(sortLessons(modules))).toEqual([
      "Introduction to Systems Thinking",
      "Orientation",
      "Syllabus"
    ]);
  });
});

describe("byLesson", () => {
  it("survives a lesson with neither a file name nor a title", () => {
    expect(() => [lesson("Chapter 1", "a-1.pdf"), {}, lesson(null, null)].sort(byLesson)).not.toThrow();
  });
});

describe("numberIn", () => {
  it("is the last number, or nothing at all", () => {
    expect(numberIn("week 10 11")).toBe(11);
    expect(numberIn("no digits here")).toBe(Infinity);
  });
});
