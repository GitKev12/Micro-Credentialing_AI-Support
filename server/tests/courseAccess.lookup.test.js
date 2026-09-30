import { describe, it, expect, jest } from "@jest/globals";
import mongoose from "mongoose";

// A tiny fake database: one ended course and no classes.
const endedCourse = {
  _id: new mongoose.Types.ObjectId(),
  courseCode: "OOP",
  endsOn: new Date("2026-09-29T00:00:00.000Z")
};

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value, String(value)]
}));

const { loadStudentRestriction } = await import("../src/lib/courseAccess.js");

mongoose.connection.collection = (name) => ({
  findOne: async () => (name === "Course" ? endedCourse : null),
  find: () => ({ toArray: async () => [] })
});

const after = new Date("2026-09-30T12:00:00.000Z");
const student = new mongoose.Types.ObjectId();

describe("loadStudentRestriction finds the course however it is named", () => {
  // The bug: an ObjectId has an `_id` of its own, so it was taken for the
  // course itself and the end date was never read.
  it("closes an ended course when given its ObjectId", async () => {
    const restriction = await loadStudentRestriction(student, endedCourse._id, after);
    expect(restriction?.ended).toBe(true);
  });

  it("closes it when given the id as a string", async () => {
    const restriction = await loadStudentRestriction(student, String(endedCourse._id), after);
    expect(restriction?.ended).toBe(true);
  });

  it("closes it when given the course document", async () => {
    const restriction = await loadStudentRestriction(student, endedCourse, after);
    expect(restriction?.ended).toBe(true);
  });
});
