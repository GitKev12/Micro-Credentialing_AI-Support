import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { fakeCollections } from "./fakeMongo.js";

const publishStanding = jest.fn();
const syncAssessorsForCourse = jest.fn(async () => {});

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));
jest.unstable_mockModule("../src/lib/standingEvents.js", () => ({ publishStanding }));
jest.unstable_mockModule("../src/admin/enrollment.sync.js", () => ({ syncAssessorsForCourse }));

const { addRequest, addStudentToClass } = await import("../src/admin/classEnrollment.js");

let db;
const sectionA = () => db.Class.find((cls) => cls._id === "k1");
const student = () => db.Student.find((row) => row._id === "s1");

beforeEach(() => {
  publishStanding.mockClear();
  syncAssessorsForCourse.mockClear();
  db = {
    Class: [
      { _id: "k1", name: "Section-A", courseId: "c1", assessorIds: ["a1"], studentIds: [], requestedStudentIds: ["s1"], posted: true, active: true },
      { _id: "k2", name: "Section-B", courseId: "c1", assessorIds: ["a2"], studentIds: [], requestedStudentIds: [], posted: true, active: true }
    ],
    Student: [{ _id: "s1", enrolledCourses: [] }]
  };
  mongoose.connection.collection = fakeCollections(db);
});

describe("addStudentToClass", () => {
  it("joins the class and writes through like Classes Management", async () => {
    expect(await addStudentToClass(sectionA(), student())).toBeNull();

    expect(sectionA().studentIds).toEqual(["s1"]);
    expect(sectionA().requestedStudentIds).toEqual([]);
    expect(student().enrolledCourses).toEqual(["c1"]);
    // The class seat first, then the student's course list, then the requests.
    expect(db.log.map((entry) => `${entry.op} ${entry.name}`)).toEqual([
      "updateOne Class",
      "updateMany Student",
      "updateMany Class"
    ]);
    expect(syncAssessorsForCourse).toHaveBeenCalledWith("c1");
    expect(publishStanding).toHaveBeenCalledWith("s1");
  });

  it("refuses a student already in another section, writing nothing", async () => {
    db.Class[1].studentIds = ["s1"];

    expect(await addStudentToClass(sectionA(), student())).toBe("Already in Section-B for this course.");
    expect(db.log).toEqual([]);
    expect(student().enrolledCourses).toEqual([]);
  });

  it("refuses a class that is not posted", async () => {
    sectionA().posted = false;

    expect(await addStudentToClass(sectionA(), student())).toBe("This class isn't open for enrollment.");
    expect(sectionA().studentIds).toEqual([]);
    expect(student().enrolledCourses).toEqual([]);
  });

  it("needs the request to still be there when accepting one", async () => {
    sectionA().requestedStudentIds = [];

    expect(await addStudentToClass(sectionA(), student(), { fromRequest: true })).toBe(
      "This class isn't open for enrollment."
    );
    expect(sectionA().studentIds).toEqual([]);
  });

  it("undoes the join when another section took the student at the same moment", async () => {
    // The other join lands just after the first check has read the classes.
    db.onFind = () => {
      db.Class[1].studentIds = ["s1"];
      db.onFind = null;
    };

    expect(await addStudentToClass(sectionA(), student())).toBe("Already in another class for this course.");
    expect(sectionA().studentIds).toEqual([]);
    expect(student().enrolledCourses).toEqual([]);
    expect(syncAssessorsForCourse).not.toHaveBeenCalled();
  });
});

describe("addRequest", () => {
  beforeEach(() => {
    sectionA().requestedStudentIds = [];
  });

  it("adds a pending request", async () => {
    expect(await addRequest(sectionA(), student())).toBeNull();
    expect(sectionA().requestedStudentIds).toEqual(["s1"]);
    expect(student().enrolledCourses).toEqual([]);
  });

  it("allows one place or one request per course", async () => {
    db.Class[1].requestedStudentIds = ["s1"];

    expect(await addRequest(sectionA(), student())).toBe("You already have a place or a request on this course.");
    expect(sectionA().requestedStudentIds).toEqual([]);
    expect(db.Class[1].requestedStudentIds).toEqual(["s1"]);
  });

  it("refuses a class that is switched off", async () => {
    sectionA().active = false;

    expect(await addRequest(sectionA(), student())).toBe("This class isn't open for enrollment.");
    expect(sectionA().requestedStudentIds).toEqual([]);
  });
});
