import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { fakeCollections } from "./fakeMongo.js";

// A course's category is set by the admin and filters Discover on the Student End.
jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

const { createCourse, updateCourse } = await import("../src/admin/modules.controller.js");

const reply = () => ({
  code: 200,
  body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});

async function call(handler, request) {
  const res = reply();
  await handler({ params: {}, body: {}, ...request }, res);
  return res;
}

let db;
beforeEach(() => {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  db = { Course: [{ _id: "c1", courseCode: "CC2", courseName: "Computer Programming 2", category: "" }] };
  mongoose.connection.collection = fakeCollections(db);
});

describe("Course category", () => {
  it("is saved trimmed when a course is created", async () => {
    const res = await call(createCourse, {
      body: { code: "OOP", title: "Object-Oriented Programming", category: "  Programming ", startsOn: "2099-01-05", endsOn: "2099-05-30" }
    });

    expect(res.code).toBe(201);
    expect(res.body.course.category).toBe("Programming");
    expect(db.Course[1].category).toBe("Programming");
  });

  it("can be changed, or cleared", async () => {
    await call(updateCourse, { params: { id: "c1" }, body: { category: "Programming" } });
    expect(db.Course[0].category).toBe("Programming");

    await call(updateCourse, { params: { id: "c1" }, body: { category: "" } });
    expect(db.Course[0].category).toBe("");
  });

  it("refuses one that is too long", async () => {
    const res = await call(updateCourse, { params: { id: "c1" }, body: { category: "x".repeat(41) } });
    expect(res.code).toBe(400);
    expect(res.body.message).toBe("The category can be at most 40 characters.");
  });
});
