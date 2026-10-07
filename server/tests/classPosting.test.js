import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { fakeCollections } from "./fakeMongo.js";

// Posting lives on the Classes page: the list carries each class's Discover
// state, the edit window gets its requests, and the form saves the enrollment.
jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));
jest.unstable_mockModule("../src/lib/standingEvents.js", () => ({ publishStanding: jest.fn() }));
jest.unstable_mockModule("../src/admin/enrollment.sync.js", () => ({ syncAssessorsForCourse: jest.fn(async () => {}) }));

const { createClass, getClass, listClasses, updateClass } = await import("../src/admin/classes.controller.js");

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
  db = {
    Class: [
      { _id: "k1", name: "Section-A", courseId: "c1", assessorIds: ["a1"], studentIds: [], requestedStudentIds: ["s1"], posted: true, enrollment: "open", active: true },
      { _id: "k2", name: "Section-B", courseId: "c1", assessorIds: [], studentIds: [], active: true }
    ],
    Course: [{ _id: "c1", courseCode: "CC2", courseName: "Computer Programming 2", status: "active", endsOn: "2099-12-31" }],
    Assessor: [{ _id: "a1", first_name: "Ramon", last_name: "Velasco" }],
    Student: [{ _id: "s1", first_name: "Andrea", last_name: "Santiago", student_id: "STU001" }]
  };
  mongoose.connection.collection = fakeCollections(db);
});

describe("Classes posting", () => {
  it("lists each class's Discover state", async () => {
    const res = await call(listClasses);
    const [first, second] = res.body.classes;

    expect(first).toMatchObject({ id: "k1", posted: true, enrollment: "open", refusal: null, requestCount: 1 });
    // Written before Discover: not posted, needs approval, and here no assessor.
    expect(second).toMatchObject({ posted: false, enrollment: "approval", refusal: "This class needs an assessor first.", requestCount: 0 });
  });

  it("gives the edit window the waiting requests", async () => {
    const res = await call(getClass, { params: { id: "k1" } });
    expect(res.body.class.requests).toEqual([{ studentId: "s1", name: "Andrea Santiago", studentNumber: "STU001" }]);
  });

  it("saves the enrollment with the class", async () => {
    const res = await call(updateClass, { params: { id: "k1" }, body: { enrollment: "approval" } });
    expect(res.code).toBe(200);
    expect(db.Class[0].enrollment).toBe("approval");
  });

  it("refuses an enrollment that isn't one of the two", async () => {
    const res = await call(updateClass, { params: { id: "k1" }, body: { enrollment: "maybe" } });
    expect(res.code).toBe(400);
    expect(db.Class[0].enrollment).toBe("open");
  });

  it("creates a class unposted, with the enrollment chosen", async () => {
    const res = await call(createClass, { body: { name: "Section-C", courseId: "c1", assessorIds: ["a1"], enrollment: "open" } });
    expect(res.code).toBe(200);
    expect(db.Class[2]).toMatchObject({ name: "Section-C", posted: false, enrollment: "open" });
  });
});
