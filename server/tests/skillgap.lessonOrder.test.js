import { describe, it, expect, jest } from "@jest/globals";
import mongoose from "mongoose";

// A tiny fake database: one course, its final (listing the lessons 3, 1, 2),
// one graded attempt, and the three lessons.
const course = { _id: "c1", courseCode: "OOP", title: "OOP" };
const lessons = [
  { _id: "m1", title: "Classes", fileName: "OOP-Chapter-1.pdf" },
  { _id: "m2", title: "Inheritance", fileName: "OOP-Chapter-2.pdf" },
  { _id: "m3", title: "Interfaces", fileName: "OOP-Chapter-10.pdf" }
];
const final = {
  _id: "f1",
  courseId: "c1",
  scope: "final",
  title: "OOP Final Exam",
  topics: [
    { moduleId: "m3", topic: "Interfaces" },
    { moduleId: "m1", topic: "Classes" },
    { moduleId: "m2", topic: "Inheritance" }
  ]
};
const result = {
  studentId: "st1",
  assessmentId: "f1",
  submittedAt: new Date("2026-09-20T00:00:00.000Z"),
  aiGrading: {
    items: [
      { moduleId: "m3", correct: true },
      { moduleId: "m1", correct: false },
      { moduleId: "m2", correct: true }
    ]
  }
};

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

const { buildStudentSkillGap } = await import("../src/skillgap/skillgap.service.js");

const rows = { Assessment: [final], StudentResult: [result], LearningModule: lessons, Class: [] };
mongoose.connection.collection = (name) => ({
  find: () => ({ toArray: async () => rows[name] ?? [] })
});

describe("the Student End's skill gap", () => {
  it("lists the skills Lesson 1 to the last lesson, not in the exam's order", async () => {
    const [courseGap] = await buildStudentSkillGap("st1", [course]);
    expect(courseGap.skills.map((skill) => skill.moduleId)).toEqual(["m1", "m2", "m3"]);
  });
});
