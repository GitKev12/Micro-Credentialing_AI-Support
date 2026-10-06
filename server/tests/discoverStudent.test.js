import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { fakeCollections } from "./fakeMongo.js";

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));
jest.unstable_mockModule("../src/lib/standingEvents.js", () => ({ publishStanding: jest.fn() }));
jest.unstable_mockModule("../src/admin/enrollment.sync.js", () => ({ syncAssessorsForCourse: jest.fn(async () => {}) }));

const { cancelEnrollRequest, enrollInClass, getDiscoverCourse, listDiscoverCourses } = await import(
  "../src/courses/discover.controller.js"
);

const reply = () => ({
  code: 200,
  body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});

async function call(handler, params) {
  const res = reply();
  await handler({ params: { id: "s1", ...params } }, res);
  return res;
}

const course = (id, code, title, extra = {}) => ({
  _id: id, courseCode: code, courseName: title, status: "active", startsOn: "2026-09-01", endsOn: "2099-12-31", ...extra
});
const section = (id, name, courseId, extra = {}) => ({
  _id: id, name, courseId, assessorIds: ["a1"], studentIds: [], requestedStudentIds: [], posted: true, active: true, ...extra
});

let db;
const cls = (id) => db.Class.find((row) => row._id === id);
const student = () => db.Student[0];

beforeEach(() => {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  db = {
    Student: [{ _id: "s1", student_id: "STU001", enrolledCourses: [] }],
    Assessor: [{ _id: "a1", first_name: "Ramon", last_name: "Velasco" }],
    Course: [
      course("c1", "CC2", "Computer Programming 2", { description: "Loops and arrays." }),
      course("c2", "EA", "Enterprise Architecture", { status: "inactive" }),
      course("c3", "OOP", "Object-Oriented Programming"),
      course("c4", "MCS", "Mobile Computing")
    ],
    Class: [
      section("k1", "Section-A", "c1", { enrollment: "open" }),
      section("k2", "Section-B", "c1", { enrollment: "approval", mode: "assessOnly" }),
      section("k3", "EA-A", "c2"),
      section("k4", "OOP-A", "c3", { posted: false }),
      section("k5", "MCS-A", "c4", { assessorIds: [] })
    ],
    LearningModule: [{ _id: "m1", courseId: "c1" }, { _id: "m2", courseId: "c1" }],
    Badge: [{ _id: "b1", courseId: "c1" }, { _id: "b2", courseId: "c1", active: false }],
    Assessment: [{ _id: "f1", courseId: "c1", scope: "final", status: "posted" }]
  };
  mongoose.connection.collection = fakeCollections(db);
});

describe("Discover cards", () => {
  it("shows only active courses with an open section", async () => {
    const res = await call(listDiscoverCourses);

    // EA is inactive, OOP is not posted, MCS has no assessor.
    expect(res.body.courses.map((card) => card.code)).toEqual(["CC2"]);
    expect(res.body.courses[0]).toMatchObject({ sectionCount: 2, enrolled: false, pending: false });
  });

  it("keeps a course the student is already in, marked Enrolled", async () => {
    student().enrolledCourses = ["c3"];
    cls("k4").studentIds = ["s1"];

    const res = await call(listDiscoverCourses);
    const oop = res.body.courses.find((card) => card.code === "OOP");
    expect(oop).toMatchObject({ sectionCount: 0, enrolled: true });
  });
});

describe("Discover course view", () => {
  it("gives counts and the open sections", async () => {
    const res = await call(getDiscoverCourse, { courseId: "c1" });

    expect(res.body.course).toMatchObject({
      code: "CC2", description: "Loops and arrays.", lessonCount: 2, badgeCount: 1, hasFinalExam: true
    });
    expect(res.body.sections).toEqual([
      expect.objectContaining({ id: "k1", enrollment: "open", mode: "taught", assessor: "Ramon Velasco", state: "none", open: true, hasFinalExam: true }),
      // An assess-only section takes only its own final, and this course's is course-wide.
      expect.objectContaining({ id: "k2", enrollment: "approval", mode: "assessOnly", state: "none", open: true, hasFinalExam: false })
    ]);
  });

  it("is not found for an inactive course", async () => {
    const res = await call(getDiscoverCourse, { courseId: "c2" });
    expect(res.code).toBe(404);
  });
});

describe("Enroll", () => {
  it("joins an open section at once", async () => {
    const res = await call(enrollInClass, { classId: "k1" });

    expect(res.code).toBe(200);
    expect(cls("k1").studentIds).toEqual(["s1"]);
    expect(student().enrolledCourses).toEqual(["c1"]);
    expect(res.body.course.enrolled).toBe(true);
    expect(res.body.sections.find((row) => row.id === "k1").state).toBe("enrolled");
  });

  it("sends a request to a section that needs approval", async () => {
    const res = await call(enrollInClass, { classId: "k2" });

    expect(res.code).toBe(200);
    expect(cls("k2").requestedStudentIds).toEqual(["s1"]);
    expect(cls("k2").studentIds).toEqual([]);
    expect(student().enrolledCourses).toEqual([]);
    expect(res.body.course.pending).toBe(true);
    expect(res.body.sections.find((row) => row.id === "k2").state).toBe("pending");
  });

  it("refuses a second section on a course the student is in", async () => {
    student().enrolledCourses = ["c1"];
    cls("k1").studentIds = ["s1"];

    const res = await call(enrollInClass, { classId: "k2" });
    expect(res.code).toBe(409);
    expect(res.body.message).toBe("You're already enrolled in this course.");
  });

  it("refuses while a request on the course is waiting", async () => {
    cls("k2").requestedStudentIds = ["s1"];

    const res = await call(enrollInClass, { classId: "k1" });
    expect(res.code).toBe(409);
    expect(res.body.message).toBe("You already asked to join Section-B.");
    expect(cls("k1").studentIds).toEqual([]);
  });

  it("is not found for a section that is not posted", async () => {
    const res = await call(enrollInClass, { classId: "k4" });
    expect(res.code).toBe(404);
    expect(cls("k4").studentIds).toEqual([]);
  });

  it("takes back a pending request", async () => {
    cls("k2").requestedStudentIds = ["s1"];

    const res = await call(cancelEnrollRequest, { classId: "k2" });
    expect(cls("k2").requestedStudentIds).toEqual([]);
    expect(res.body.sections.find((row) => row.id === "k2").state).toBe("none");
  });
});
