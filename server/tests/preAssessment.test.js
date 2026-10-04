import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import mongoose from "mongoose";

/*
 * Pre-Assessments. Uses a fake database; nothing here touches a real one.
 */

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

let held;
let restriction;
jest.unstable_mockModule("../src/lib/courseAccess.js", () => ({
  classHolding: async () => held,
  loadStudentRestriction: async () => restriction,
  refuseRestrictedCourse: (response) => response.status(423).json({ message: "Closed." })
}));

const { cleanItems, scoreAnswers, submitPreAssessment } = await import(
  "../src/preAssessments/preAssessments.controller.js"
);

const reply = () => ({
  code: 200,
  body: null,
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

const mc = { type: "multiple-choice", q: "First index?", choices: [{ text: "0" }, { text: "1" }], key: "a" };
const tf = { type: "true-false", q: "Arrays have a fixed size.", key: "true" };

describe("checking the admin's questions", () => {
  it("takes 1 to 5 questions and letters the choices", () => {
    const { items } = cleanItems([mc, tf]);
    expect(items[0]).toMatchObject({ id: "p1", key: "a", choices: [{ id: "a", text: "0" }, { id: "b", text: "1" }] });
    expect(items[1].choices.map((choice) => choice.id)).toEqual(["true", "false"]);
  });

  it("refuses none, or more than 5", () => {
    expect(cleanItems([]).error).toBeTruthy();
    expect(cleanItems([mc, mc, mc, mc, mc, mc]).error).toMatch(/at most 5/);
  });

  it("refuses a question without a correct answer or with one choice", () => {
    expect(cleanItems([{ ...mc, key: "c" }]).error).toMatch(/correct answer/);
    expect(cleanItems([{ ...mc, choices: [{ text: "0" }] }]).error).toMatch(/2 to 6/);
  });
});

describe("marking", () => {
  it("counts the right answers", () => {
    const { items } = cleanItems([mc, tf]);
    expect(scoreAnswers(items, { p1: "a", p2: "false" })).toEqual({ score: 1, total: 2 });
  });
});

describe("taking it", () => {
  let attempt;
  let inserted;

  beforeEach(() => {
    held = { id: "k1", mode: "taught" };
    restriction = null;
    attempt = null;
    inserted = [];
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
    mongoose.connection.collection = (name) => ({
      findOne: async () =>
        name === "PreAssessment"
          ? { _id: "pa1", moduleId: "m1", courseId: "c1", active: true, items: cleanItems([mc, tf]).items }
          : attempt,
      insertOne: async (doc) => inserted.push(doc)
    });
  });

  const submit = async (answers) => {
    const res = reply();
    await submitPreAssessment({ params: { studentId: "s1", preAssessmentId: "pa1" }, body: { answers } }, res);
    return res;
  };

  it("scores and keeps one attempt", async () => {
    const res = await submit({ p1: "a", p2: "true" });
    expect(res.code).toBe(201);
    expect(res.body.attempt).toMatchObject({ score: 2, total: 2 });
    expect(inserted).toHaveLength(1);
  });

  it("refuses a second attempt", async () => {
    attempt = { score: 1, total: 2 };
    const res = await submit({ p1: "a" });
    expect(res.code).toBe(409);
    expect(inserted).toHaveLength(0);
  });

  it("is not offered on the assess-only pathway", async () => {
    held = { id: "k1", mode: "assessOnly" };
    const res = await submit({ p1: "a" });
    expect(res.code).toBe(404);
  });
});
