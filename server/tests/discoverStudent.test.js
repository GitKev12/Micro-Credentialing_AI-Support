import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { fakeCollections } from "./fakeMongo.js";

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));
jest.unstable_mockModule("../src/lib/standingEvents.js", () => ({ publishStanding: jest.fn() }));
jest.unstable_mockModule("../src/admin/enrollment.sync.js", () => ({ syncAssessorsForCourse: jest.fn(async () => {}) }));

const { cancelEnrollRequest, enrollInCourse, getDiscoverCourse, listDiscoverCourses } = await import(
  "../src/courses/discover.controller.js"
);

const reply = () => ({
  code: 200,
  body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});

async function call(handler, params, body) {
  const res = reply();
  await handler({ params: { id: "s1", ...params }, body }, res);
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
      course("c1", "CC2", "Computer Programming 2", { description: "Loops and arrays.", category: " Programming ", courseHours: 30 }),
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
    // Out of chapter order on purpose: the syllabus is sorted, not stored sorted.
    LearningModule: [
      { _id: "m2", courseId: "c1", title: "Arrays", fileName: "CC2-Chapter-2.pdf" },
      { _id: "m1", courseId: "c1", title: "Looping", fileName: "CC2-Chapter-1.pdf" }
    ],
    Badge: [
      { _id: "b1", courseId: "c1", moduleId: "m1", name: "Looping" },
      { _id: "b2", courseId: "c1", moduleId: "m2", name: "Arrays", active: false }
    ],
    Assessment: [{ _id: "f1", courseId: "c1", scope: "final", status: "posted", title: "CC2 Final Exam", credentialName: "CC2 Final Exam Credential" }]
  };
  mongoose.connection.collection = fakeCollections(db);
});

describe("Discover cards", () => {
  it("shows only active courses with an open section", async () => {
    const res = await call(listDiscoverCourses);

    // EA is inactive, OOP is not posted, MCS has no assessor.
    expect(res.body.courses.map((card) => card.code)).toEqual(["CC2"]);
    expect(res.body.courses[0]).toMatchObject({ enrolled: false, pending: false });
  });

  it("never tells a card how many sections a course has", async () => {
    const res = await call(listDiscoverCourses);
    expect(res.body.courses[0].sectionCount).toBeUndefined();
  });

  it("gives each card what the search bar filters on", async () => {
    const res = await call(listDiscoverCourses);
    const [card] = res.body.courses;

    expect(card.category).toBe("Programming");
    // Section-A is open and taught, Section-B needs approval and is assess-only.
    expect(card.openSections).toEqual([
      { enrollment: "open", mode: "taught" },
      { enrollment: "approval", mode: "assessOnly" }
    ]);
  });

  it("reports each pathway's join the way the course page will, open first", async () => {
    // A second taught section that needs approval: the student would still be
    // put in the open one, so the card must not say the taught pathway needs approval.
    db.Class.push(section("k6", "Section-C", "c1", { enrollment: "approval" }));

    const res = await call(listDiscoverCourses);
    expect(res.body.courses[0].openSections).toEqual([
      { enrollment: "open", mode: "taught" },
      { enrollment: "approval", mode: "assessOnly" }
    ]);
  });

  it("keeps a course the student is already in, marked Enrolled", async () => {
    student().enrolledCourses = ["c3"];
    cls("k4").studentIds = ["s1"];

    const res = await call(listDiscoverCourses);
    expect(res.body.courses.find((card) => card.code === "OOP")).toMatchObject({ enrolled: true });
  });
});

describe("Discover course view", () => {
  it("gives the counts, the pathways and the syllabus", async () => {
    const res = await call(getDiscoverCourse, { courseId: "c1" });

    expect(res.body.course).toMatchObject({
      code: "CC2", description: "Loops and arrays.", lessonCount: 2, badgeCount: 1, hasFinalExam: true, courseHours: 30
    });
    // The assess-only section has no final of its own, and it never takes the
    // course's, so it has no certificate to offer yet.
    expect(res.body.pathways).toEqual([
      { mode: "taught", label: "Taught and assessed", enrollment: "open", assessor: "Ramon Velasco", certificate: "CC2 Final Exam Credential" },
      { mode: "assessOnly", label: "Assess-only", enrollment: "approval", assessor: "Ramon Velasco", certificate: null }
    ]);
    expect(res.body.course).toMatchObject({ myAssessor: null, myCertificate: null });
  });

  it("names the certificate from the class's own final when it has one", async () => {
    db.Assessment.push({ _id: "f2", courseId: "c1", classId: "k2", scope: "final", status: "posted", title: "CC2 Final Exam (Assess-only)" });

    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "assessOnly" });
    expect(res.body.pathways[1].certificate).toBe("CC2 Final Exam (Assess-only) Credential");
    expect(res.body.course.myCertificate).toBe("CC2 Final Exam (Assess-only) Credential");
  });

  it("names the assessor of the section each pathway would place the student in", async () => {
    db.Assessor.push({ _id: "a2", first_name: "Marivic", last_name: "Cortez" });
    cls("k2").assessorIds = ["a2"];

    const res = await call(getDiscoverCourse, { courseId: "c1" });
    expect(res.body.pathways.map((pathway) => pathway.assessor)).toEqual(["Ramon Velasco", "Marivic Cortez"]);
  });

  it("names the student's own assessor once they have joined", async () => {
    db.Assessor.push({ _id: "a2", first_name: "Marivic", last_name: "Cortez" });
    cls("k2").assessorIds = ["a2"];

    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "assessOnly" });
    expect(res.body.course).toMatchObject({ pending: true, myAssessor: "Marivic Cortez" });
  });

  it("names no section anywhere in what the student is sent", async () => {
    const res = await call(getDiscoverCourse, { courseId: "c1" });

    expect(res.body.sections).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("Section-A");
    expect(JSON.stringify(res.body)).not.toContain("schedule");
  });

  it("puts the syllabus in chapter order, with each lesson's badge", async () => {
    const res = await call(getDiscoverCourse, { courseId: "c1" });

    expect(res.body.curriculum).toEqual([
      { id: "m1", title: "Looping", badge: "Looping" },
      // b2 is switched off, so Arrays has no badge to earn.
      { id: "m2", title: "Arrays", badge: null }
    ]);
  });

  it("counts everyone on the course", async () => {
    cls("k1").studentIds = ["s9"];
    cls("k2").studentIds = ["s8", "s7"];

    const res = await call(getDiscoverCourse, { courseId: "c1" });
    expect(res.body.course.learnerCount).toBe(3);
  });

  it("is not found for an inactive course", async () => {
    const res = await call(getDiscoverCourse, { courseId: "c2" });
    expect(res.code).toBe(404);
  });
});

describe("Enroll", () => {
  it("joins an open pathway at once", async () => {
    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "taught" });

    expect(res.code).toBe(200);
    expect(cls("k1").studentIds).toEqual(["s1"]);
    expect(student().enrolledCourses).toEqual(["c1"]);
    expect(res.body.course).toMatchObject({ enrolled: true, myMode: "taught" });
  });

  it("sends a request when the pathway needs approval", async () => {
    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "assessOnly" });

    expect(res.code).toBe(200);
    expect(cls("k2").requestedStudentIds).toEqual(["s1"]);
    expect(cls("k2").studentIds).toEqual([]);
    expect(student().enrolledCourses).toEqual([]);
    expect(res.body.course).toMatchObject({ pending: true, myMode: "assessOnly", myModeLabel: "Assess-only" });
  });

  it("takes the open section over the gated one in the same pathway", async () => {
    // A second taught section, needing approval and listed first.
    db.Class.unshift(section("k0", "Section-0", "c1", { enrollment: "approval" }));

    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "taught" });

    expect(res.code).toBe(200);
    expect(cls("k1").studentIds).toEqual(["s1"]);
    expect(cls("k0").requestedStudentIds).toEqual([]);
  });

  it("takes the emptiest section when neither is more open than the other", async () => {
    cls("k1").studentIds = ["s9", "s8"];
    db.Class.push(section("k6", "Section-C", "c1", { enrollment: "open", studentIds: ["s7"] }));

    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "taught" });

    expect(res.code).toBe(200);
    expect(cls("k6").studentIds).toEqual(["s7", "s1"]);
    expect(cls("k1").studentIds).toEqual(["s9", "s8"]);
  });

  it("refuses a course the student is already in", async () => {
    student().enrolledCourses = ["c1"];
    cls("k1").studentIds = ["s1"];

    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "assessOnly" });
    expect(res.code).toBe(409);
    expect(res.body.message).toBe("You're already enrolled in this course.");
  });

  it("refuses while a request on the course is waiting", async () => {
    cls("k2").requestedStudentIds = ["s1"];

    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "taught" });
    expect(res.code).toBe(409);
    // No section is named, because the student never saw one.
    expect(res.body.message).toBe("You already asked to join this course.");
    expect(cls("k1").studentIds).toEqual([]);
  });

  it("refuses a pathway nobody is running", async () => {
    cls("k2").mode = "taught";

    const res = await call(enrollInCourse, { courseId: "c1" }, { mode: "assessOnly" });
    expect(res.code).toBe(404);
    expect(res.body.message).toBe("Assess-only isn't open on this course.");
  });

  it("refuses a body that names no pathway", async () => {
    const res = await call(enrollInCourse, { courseId: "c1" }, {});
    expect(res.code).toBe(400);
  });

  it("is not found for a course with nothing posted", async () => {
    const res = await call(enrollInCourse, { courseId: "c3" }, { mode: "taught" });
    expect(res.code).toBe(404);
    expect(cls("k4").studentIds).toEqual([]);
  });

  it("takes back a pending request, found by course", async () => {
    cls("k2").requestedStudentIds = ["s1"];

    const res = await call(cancelEnrollRequest, { courseId: "c1" });
    expect(cls("k2").requestedStudentIds).toEqual([]);
    expect(res.body.course.pending).toBe(false);
  });
});
