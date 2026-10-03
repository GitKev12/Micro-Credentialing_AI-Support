import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { checkCourseCode, checkCourseTitle, checkEmail, checkName } from "../src/lib/fieldRules.js";

/*
 * Creating a student or assessor against a fake in-memory database: the
 * server makes the next ID number and a password, and refuses bad names and
 * emails. Nothing here touches a real database.
 */

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

// getStudent/getAssessor just echo the stored account, as the real ones would.
jest.unstable_mockModule("../src/admin/admin.controller.js", () => ({
  getStudent: async (request, response) => response.json({ student: stored(request.params.id) }),
  getAssessor: async (request, response) => response.json({ assessor: stored(request.params.id) })
}));

const { createStudent, createAssessor } = await import("../src/admin/accounts.controller.js");

let rows;
const stored = (id) => Object.values(rows).flat().find((row) => row._id === id);

// Just enough of a MongoDB collection for these handlers.
const fakeCollection = (name) => ({
  find: (filter = {}) => ({
    toArray: async () =>
      (rows[name] ?? []).filter((row) =>
        Object.entries(filter).every(([field, rule]) => !rule?.$regex || rule.$regex.test(row[field] ?? ""))
      )
  }),
  findOne: async () => null,
  createIndex: async () => {},
  insertOne: async (document) => {
    const _id = `new-${name}-${(rows[name] ?? []).length}`;
    rows[name] = [...(rows[name] ?? []), { ...document, _id }];
    return { insertedId: _id };
  }
});

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

beforeEach(() => {
  rows = {
    Student: [
      { _id: "s1", student_id: "STU2023300024", email: "x1@student.edu.ph" },
      { _id: "s2", student_id: "STU2023300025", email: "x2@student.edu.ph" },
      { _id: "s3", student_id: "STU001", email: "x3@student.edu.ph" } // a different pattern
    ],
    Assessor: [{ _id: "a1", assessor_id: "ASS016", email: "y1@assessor.edu.ph" }],
    Admin: []
  };
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  mongoose.connection.collection = fakeCollection;
});

describe("creating an account", () => {
  it("gives a student the next ID number and a generated password", async () => {
    const res = reply();
    await createStudent(
      { params: {}, body: { firstName: "Juan", lastName: "Dela Cruz", email: "juan026@student.edu.ph" } },
      res
    );

    expect(res.code).toBe(200);
    expect(res.body.student.student_id).toBe("STU2023300026");
    expect(res.body.password).toMatch(/^[A-Za-z0-9]{12}$/);
    // Only the hash is stored, never the password itself.
    expect(res.body.student.password).not.toBe(res.body.password);
  }, 20000);

  it("gives an assessor the next ID number", async () => {
    const res = reply();
    await createAssessor({ params: {}, body: { name: "Maria Santos", email: "maria017@assessor.edu.ph" } }, res);

    expect(res.body.assessor.assessor_id).toBe("ASS017");
    expect(res.body.password).toHaveLength(12);
  }, 20000);

  it("keeps the ID and password an Import row sends, and shows no password back", async () => {
    const res = reply();
    await createStudent(
      {
        params: {},
        body: { firstName: "Ana", lastName: "Reyes", email: "ana@student.edu.ph", studentNumber: "202300099", password: "longenough" }
      },
      res
    );

    expect(res.body.student.student_id).toBe("202300099");
    expect(res.body.password).toBeUndefined();
  }, 20000);

  it("refuses a one-letter name and a fake email", async () => {
    const badName = reply();
    await createStudent({ params: {}, body: { firstName: "a", lastName: "Cruz", email: "a@b.com" } }, badName);
    expect(badName.code).toBe(400);
    expect(badName.body.message).toBe("First name must be at least 2 letters.");

    const badEmail = reply();
    await createAssessor({ params: {}, body: { name: "Ana Cruz", email: "s@g.c" } }, badEmail);
    expect(badEmail.code).toBe(400);
    expect(badEmail.body.message).toMatch(/valid email/);
  });
});

describe("the field rules", () => {
  it("accepts real names and refuses symbols and single letters", () => {
    for (const name of ["Ana", "De Guzman", "O'Neil", "Jr.", "José Ñuñez", "Mary-Ann"]) {
      expect(checkName(name)).toBeNull();
    }
    for (const name of ["a", "a.", "J0hn", "Ana@", "#Ana", ""]) {
      expect(checkName(name)).not.toBeNull();
    }
  });

  it("accepts real emails and refuses s@g.c", () => {
    expect(checkEmail("andrea001@student.edu.ph")).toBeNull();
    for (const email of ["s@g.c", "bad@", "a b@c.com", "plain"]) expect(checkEmail(email)).not.toBeNull();
  });

  it("checks course codes and titles", () => {
    expect(checkCourseCode("ITTSM ELECT 5")).toBeNull();
    expect(checkCourseCode("a")).not.toBeNull();
    expect(checkCourseCode("CC2!")).not.toBeNull();
    expect(checkCourseTitle("IT Elective 5: Tech Support (Part 1)")).toBeNull();
    expect(checkCourseTitle("<script>")).not.toBeNull();
  });
});
