import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { fakeCollections } from "./fakeMongo.js";

// How long a course takes, in hours — the "30 Hours" a catalogue entry carries.
// The admin types it; the Student End shows it on the course view.
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

const newCourse = (extra) => ({
  code: "OOP", title: "Object-Oriented Programming", startsOn: "2099-01-05", endsOn: "2099-05-30", ...extra
});

let db;
beforeEach(() => {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  db = { Course: [{ _id: "c1", courseCode: "CC2", courseName: "Computer Programming 2", courseHours: 30 }] };
  mongoose.connection.collection = fakeCollections(db);
});

describe("Course hours", () => {
  it("is stored as a number when a course is created", async () => {
    const res = await call(createCourse, { body: newCourse({ courseHours: "30" }) });

    expect(res.code).toBe(201);
    expect(res.body.course.courseHours).toBe(30);
    expect(db.Course[1].courseHours).toBe(30);
  });

  it("is null on a course created without one", async () => {
    const res = await call(createCourse, { body: newCourse() });

    expect(res.code).toBe(201);
    expect(res.body.course.courseHours).toBeNull();
    expect(db.Course[1].courseHours).toBeNull();
  });

  it("can be changed, or cleared", async () => {
    await call(updateCourse, { params: { id: "c1" }, body: { courseHours: "45" } });
    expect(db.Course[0].courseHours).toBe(45);

    await call(updateCourse, { params: { id: "c1" }, body: { courseHours: "" } });
    expect(db.Course[0].courseHours).toBeNull();
  });

  it("refuses anything that isn't a whole number", async () => {
    for (const bad of ["7.5", "thirty", "-4"]) {
      const res = await call(updateCourse, { params: { id: "c1" }, body: { courseHours: bad } });
      expect(res.code).toBe(400);
      expect(res.body.message).toBe("Course hours must be a whole number.");
    }
    // Untouched by any of them.
    expect(db.Course[0].courseHours).toBe(30);
  });

  it("refuses a typo like 30000", async () => {
    const res = await call(updateCourse, { params: { id: "c1" }, body: { courseHours: "30000" } });
    expect(res.code).toBe(400);
    expect(res.body.message).toBe("Course hours can be at most 1000.");
  });

  it("refuses zero", async () => {
    const res = await call(updateCourse, { params: { id: "c1" }, body: { courseHours: "0" } });
    expect(res.code).toBe(400);
    expect(res.body.message).toBe("Course hours must be at least 1.");
  });
});
