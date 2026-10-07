import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));
jest.unstable_mockModule("../src/lib/standingEvents.js", () => ({ publishStanding: jest.fn() }));
jest.unstable_mockModule("../src/admin/enrollment.sync.js", () => ({ syncAssessorsForCourse: jest.fn() }));

const { setClassDiscover, acceptEnrollRequest, declineEnrollRequest } = await import("../src/admin/discover.controller.js");

const reply = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
let db, updates;
// The code asks by plain id ({ _id: "k1" }) or by candidates ({ _id: { $in: [...] } }).
const matches = (want, id) => (want?.$in ? want.$in.includes(id) : want === id);
const one = (name, filter) => db[name].find((doc) => !filter?._id || matches(filter._id, doc._id));
const cursor = (rows) => ({ sort: () => cursor(rows), toArray: async () => rows });
function coll(name) {
  return {
    findOne: async (filter) => one(name, filter),
    find: (filter = {}) => cursor(db[name].filter((doc) => !filter.archived || filter.archived.$ne !== true || doc.archived !== true)),
    updateOne: async (filter, change) => {
      const doc = one(name, filter); if (!doc) return { modifiedCount: 0 };
      updates.push({ name, filter, change });
      Object.assign(doc, change.$set ?? {});
      if (change.$addToSet) for (const [k, v] of Object.entries(change.$addToSet)) doc[k] = [...new Set([...(doc[k] ?? []), v])];
      if (change.$pull) for (const [k, v] of Object.entries(change.$pull)) doc[k] = (doc[k] ?? []).filter((id) => !(v.$in ?? []).includes(id));
      return { modifiedCount: 1 };
    },
    updateMany: async () => ({ modifiedCount: 1 }),
    countDocuments: async (filter) => db[name].filter((doc) => (filter.courseId?.$in ?? []).includes(doc.courseId) && (doc.studentIds ?? []).some((id) => (filter.studentIds?.$in ?? []).includes(id))).length
  };
}

beforeEach(() => {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  updates = [];
  db = {
    Class: [{ _id: "k1", name: "Section-A", courseId: "c1", assessorIds: ["a1"], studentIds: [], requestedStudentIds: ["s1"], posted: true, enrollment: "approval", active: true, schedule: { days: "Mon Wed", time: "9:00-10:30", room: "Room 301" } }],
    Course: [{ _id: "c1", courseCode: "CC2", courseName: "Computer Programming 2", status: "active", startsOn: "2026-09-01", endsOn: "2099-12-31" }],
    Assessor: [{ _id: "a1", first_name: "Ramon", last_name: "Velasco" }],
    Student: [{ _id: "s1", first_name: "Andrea", last_name: "Santiago", student_id: "STU001" }]
  };
  mongoose.connection.collection = coll;
});

describe("admin Discover", () => {
  it("posts a class and answers with its posting state", async () => {
    db.Class[0].posted = false;
    const res = reply(); await setClassDiscover({ params: { id: "k1" }, body: { posted: true } }, res);
    expect(db.Class[0].posted).toBe(true);
    expect(res.body.class).toMatchObject({ id: "k1", posted: true, enrollment: "approval", refusal: null });
    expect(res.body.class.requests[0]).toMatchObject({ name: "Andrea Santiago", studentNumber: "STU001" });
  });

  it("won't post a class without an assessor, and says why", async () => {
    Object.assign(db.Class[0], { posted: false, assessorIds: [] });
    const res = reply(); await setClassDiscover({ params: { id: "k1" }, body: { posted: true } }, res);
    expect(res.code).toBe(400);
    expect(res.body.message).toBe("This class needs an assessor first.");
    expect(db.Class[0].posted).toBe(false);
  });

  it("unposting clears requests", async () => {
    const res = reply(); await setClassDiscover({ params: { id: "k1" }, body: { posted: false } }, res);
    expect(db.Class[0].posted).toBe(false);
    expect(db.Class[0].requestedStudentIds).toEqual([]);
  });

  it("rejects bad enrollment values", async () => {
    const res = reply(); await setClassDiscover({ params: { id: "k1" }, body: { enrollment: "maybe" } }, res);
    expect(res.code).toBe(400);
  });

  it("accepts requests", async () => {
    const res = reply(); await acceptEnrollRequest({ params: { id: "k1", studentId: "s1" } }, res);
    expect(db.Class[0].studentIds).toEqual(["s1"]);
    expect(db.Class[0].requestedStudentIds).toEqual([]);
  });

  it("declines requests", async () => {
    const res = reply(); await declineEnrollRequest({ params: { id: "k1", studentId: "s1" } }, res);
    expect(db.Class[0].requestedStudentIds).toEqual([]);
  });
});
