import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  clearRuns,
  endRun,
  lessonDone,
  lessonStarted,
  readRun,
  runKey,
  setStage,
  startRun
} from "../src/assessments/generation.progress.js";

describe("runKey", () => {
  it("separates two classes writing the same paper", () => {
    const a = runKey({ courseId: "c1", classId: "k1", scope: "final" });
    const b = runKey({ courseId: "c1", classId: "k2", scope: "final" });
    expect(a).not.toBe(b);
  });

  it("separates a lesson quiz from the final of the same course", () => {
    const quiz = runKey({ courseId: "c1", scope: "lesson", moduleId: "m1" });
    const final = runKey({ courseId: "c1", scope: "final" });
    expect(quiz).not.toBe(final);
  });

  it("is the same key whether the class is null or missing", () => {
    expect(runKey({ courseId: "c1", scope: "final" })).toBe(
      runKey({ courseId: "c1", classId: null, scope: "final" })
    );
  });
});

describe("a run's progress", () => {
  const key = runKey({ courseId: "c1", classId: "k1", scope: "final" });

  beforeEach(() => clearRuns());

  it("is null before anything starts", () => {
    expect(readRun(key)).toBeNull();
  });

  it("starts with no count, because the plan has not been read yet", () => {
    startRun(key);
    expect(readRun(key)).toMatchObject({ stage: "reading", total: 0, done: 0 });
  });

  it("takes its count from the writing stage", () => {
    startRun(key);
    setStage(key, "writing", 13);
    expect(readRun(key)).toMatchObject({ stage: "writing", total: 13, done: 0 });
  });

  it("counts each lesson as it lands, and names the ones in flight", () => {
    startRun(key);
    setStage(key, "writing", 3);

    lessonStarted(key, "Arrays");
    lessonStarted(key, "Looping");
    expect(readRun(key)).toMatchObject({ done: 0, writing: ["Arrays", "Looping"] });

    lessonDone(key, "Arrays");
    expect(readRun(key)).toMatchObject({
      done: 1,
      writing: ["Looping"],
      written: ["Arrays"]
    });
  });

  it("counts a lesson that came back short, because the call was still spent", () => {
    startRun(key);
    setStage(key, "writing", 2);
    lessonStarted(key, "Arrays");
    lessonDone(key, "Arrays");
    expect(readRun(key).done).toBe(1);
  });

  it("ends done, with nothing left in flight", () => {
    startRun(key);
    setStage(key, "writing", 2);
    lessonStarted(key, "Arrays");
    endRun(key);
    expect(readRun(key)).toMatchObject({ stage: "done", writing: [] });
    expect(readRun(key).finishedAt).toEqual(expect.any(Number));
  });

  it("ignores reports for a run that was never started", () => {
    expect(setStage("nobody", "writing", 4)).toBeNull();
    expect(lessonDone("nobody", "Arrays")).toBeNull();
    expect(endRun("nobody")).toBeNull();
    expect(readRun("nobody")).toBeNull();
  });

  it("hands back a copy, so a reader cannot edit the run", () => {
    startRun(key);
    setStage(key, "writing", 2);
    lessonStarted(key, "Arrays");

    readRun(key).writing.push("Not a lesson");
    expect(readRun(key).writing).toEqual(["Arrays"]);
  });

  it("starts a second run of the same paper from nothing", () => {
    startRun(key);
    setStage(key, "writing", 2);
    lessonDone(key, "Arrays");

    startRun(key);
    expect(readRun(key)).toMatchObject({ done: 0, total: 0, written: [] });
  });
});
