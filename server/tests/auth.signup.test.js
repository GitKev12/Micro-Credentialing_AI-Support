import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";

const hash = jest.fn(async () => "bcrypt-hash");
jest.unstable_mockModule("bcryptjs", () => ({ default: { hash } }));
let exists = true;
jest.unstable_mockModule("../src/lib/mongo.js", () => ({ collectionExists: async () => exists }));
const consumeSignupCode = jest.fn(async () => true);
jest.unstable_mockModule("../src/auth/emailVerification.controller.js", () => ({ consumeSignupCode }));
const { signupStudent } = await import("../src/auth/signup.controller.js");
const { ensureAccountIndexes } = await import("../src/auth/accountCreation.js");
const { resetSignupLimit, refuseSignupIfLimited, SIGNUP_WINDOW_MS, MAX_SIGNUP_IPS } =
  await import("../src/auth/signupLimit.js");

let rows, createIndex, insertOne, access;
const valid = () => ({ firstName: " Ana ", lastName: " Reyes ", email: " ANA@School.edu.ph ", password: " Strong pass1! ", code: "123456" });
const response = () => ({
  code: 200, body: null, set: jest.fn(),
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});
const matches = (row, filter) => filter.$or
  ? filter.$or.some((part) => matches(row, part))
  : Object.entries(filter).every(([field, rule]) => rule?.$in
    ? rule.$in.includes(row[field]) : rule?.$regex ? rule.$regex.test(row[field] ?? "") : row[field] === rule);
const signup = async (body = valid(), ip = "1.1.1.1") => {
  const res = response();
  await signupStudent({ body, ip }, res);
  return res;
};

beforeEach(() => {
  resetSignupLimit();
  hash.mockClear();
  consumeSignupCode.mockClear();
  consumeSignupCode.mockResolvedValue(true);
  exists = true;
  rows = { Student: [], Assessor: [], Admin: [] };
  createIndex = jest.fn(async () => "index");
  insertOne = jest.fn(async (doc) => { rows.Student.push(doc); return { insertedId: "student-1" }; });
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  access = jest.fn((name) => ({
    createIndex,
    insertOne,
    find: (filter) => ({ toArray: async () => rows[name].filter((row) => matches(row, filter)) }),
    findOne: async (filter) => rows[name].find((row) => matches(row, filter)) ?? null
  }));
  mongoose.connection.collection = access;
});

describe("public signup", () => {
  it("creates an active student using a generated ID, bcrypt12, and no token or password reply", async () => {
    const res = await signup();
    expect(res.code).toBe(201);
    expect(res.body).toEqual({ message: "Account created. You can now sign in." });
    expect(hash).toHaveBeenCalledWith(" Strong pass1! ", 12);
    expect(consumeSignupCode).toHaveBeenCalledWith("ana@school.edu.ph", "123456");
    expect(rows.Student[0]).toEqual({
      first_name: "Ana", last_name: "Reyes", email: "ana@school.edu.ph", password: "bcrypt-hash",
      suspended: false, archived: false, enrolledCourses: [], createdAt: expect.any(Date), student_id: "STU2023300001"
    });
  });

  it.each([undefined, null, [], "text", 3, {}, { ...valid(), firstName: null },
    { ...valid(), lastName: ["Reyes"] }, { ...valid(), email: { $ne: "" } },
    { ...valid(), password: 12345678 }, { ...valid(), password: ["Strong pass1!"] }])(
    "rejects missing and non-string fields without expensive work (%p)", async (body) => {
      const res = response();
      await signupStudent({ body, ip: "one" }, res);
      expect(res.code).toBe(400);
      expect(access).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
    });

  it.each(["firstName", "lastName", "email", "password", "code"])("requires %s", async (key) => {
    const body = valid(); delete body[key];
    expect((await signup(body)).code).toBe(400);
  });

  it.each(["role", "permissions", "studentNumber", "student_id", "suspended", "archived", "enrolledCourses", "_id", "resetPassword", "__proto__"])(
    "refuses injected field %s", async (key) => {
      const body = { ...valid(), [key]: "admin" };
      expect((await signup(body)).code).toBe(400);
      expect(hash).not.toHaveBeenCalled();
      expect(insertOne).not.toHaveBeenCalled();
    });

  it.each([{ firstName: "A" }, { firstName: "A1" }, { lastName: "<script>" },
    { lastName: "a".repeat(61) }, { email: "bad" }, { email: "s@g.c" },
    { email: "a".repeat(255) + "@example.com" }])("uses existing name/email rules (%p)", async (patch) => {
      expect((await signup({ ...valid(), ...patch })).code).toBe(400);
      expect(access).not.toHaveBeenCalled();
    });

  it.each(["", "short12", "a".repeat(73), "é".repeat(37), "😀".repeat(19), "a".repeat(71) + "  "])(
    "refuses a short or over-72-byte password (%p)", async (password) => {
      expect((await signup({ ...valid(), password })).code).toBe(400);
      expect(hash).not.toHaveBeenCalled();
    });

  it.each(["12345678", "a".repeat(72), "é".repeat(36), "😀".repeat(18), "        "])(
    "hashes strong valid password bytes without trimming (%p)", async (password) => {
      expect((await signup({ ...valid(), password })).code).toBe(201);
      expect(hash).toHaveBeenCalledWith(password, 12);
    });

  it("requires both exact unique Student indexes even for a new collection", async () => {
    exists = false;
    expect((await signup()).code).toBe(201);
    expect(createIndex.mock.calls).toEqual([
      [{ email: 1 }, { unique: true, sparse: true, name: "student_email_unique" }],
      [{ student_id: 1 }, { unique: true, sparse: true, name: "student_number_unique" }]
    ]);
  });

  it.each([1, 2])("fails closed if index %s fails, without hashing or inserting", async (position) => {
    createIndex.mockImplementation(async () => {
      if (createIndex.mock.calls.length === position) throw Object.assign(new Error("secret duplicate value"), { code: 11000 });
    });
    const res = await signup();
    expect(res.code).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|duplicate|index/);
    expect(hash).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("does not reuse a swallowed best-effort admin index failure", async () => {
    createIndex.mockRejectedValue(new Error("index conflict"));
    await expect(ensureAccountIndexes("Student", "student_id")).resolves.toBeUndefined();
    expect((await signup()).code).toBe(503);
    createIndex.mockResolvedValue("index");
    expect((await signup()).code).toBe(201);
  });

  it.each(["Student", "Assessor", "Admin"])("returns the same generic 409 for %s email duplicates", async (role) => {
    rows[role].push({ email: " ANA@SCHOOL.EDU.PH " });
    expect((await signup()).body).toEqual({ message: "An account with these details already exists." });
    expect(hash).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });


  it("does not insert when the signup code is invalid", async () => {
    consumeSignupCode.mockResolvedValueOnce(false);
    const res = await signup();
    expect(res.code).toBe(400);
    expect(res.body).toEqual({ message: "Verify your email first." });
    expect(insertOne).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it("handles a duplicate email race with generic 409 and no retry", async () => {
    insertOne.mockRejectedValue(Object.assign(new Error("E11000 secret email"), { code: 11000, keyPattern: { email: 1 } }));
    const res = await signup();
    expect(res.code).toBe(409);
    expect(res.body).toEqual({ message: "An account with these details already exists." });
    expect(insertOne).toHaveBeenCalledTimes(1);
  });

  it.each(["keyPattern", "keyValue", "message"])("retries duplicate student IDs (%s)", async (kind) => {
    const error = Object.assign(new Error(kind === "message" ? "student_number_unique student_id" : "duplicate"), { code: 11000 });
    if (kind !== "message") error[kind] = { student_id: kind === "keyValue" ? "STU2023300001" : 1 };
    insertOne.mockRejectedValueOnce(error);
    expect((await signup()).code).toBe(201);
    expect(insertOne.mock.calls.map(([doc]) => doc.student_id)).toEqual(["STU2023300001", "STU2023300002"]);
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it("skips IDs held by assessors and admin aliases without getting stuck", async () => {
    rows.Assessor.push({ assessor_id: "STU2023300001" });
    rows.Admin.push({ username: "STU2023300002" });
    expect((await signup()).code).toBe(201);
    expect(rows.Student[0].student_id).toBe("STU2023300003");
    expect(insertOne).toHaveBeenCalledTimes(1);
  });

  it("uses the existing student ID prefix and sequence", async () => {
    rows.Student.push({ student_id: "STU2023300025" }, { student_id: "STU001" });
    expect((await signup()).code).toBe(201);
    expect(rows.Student.at(-1).student_id).toBe("STU2023300026");
  });

  it("stops after five ID races with safe 503", async () => {
    insertOne.mockRejectedValue(Object.assign(new Error("student_id secret"), { code: 11000, keyPattern: { student_id: 1 } }));
    const res = await signup();
    expect(res.code).toBe(503);
    expect(insertOne).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|student_id/);
  });

  it("stops after five cross-role conflicts", async () => {
    rows.Assessor = Array.from({ length: 5 }, (_, i) => ({ assessor_id: `STU202330000${i + 1}` }));
    expect((await signup()).code).toBe(503);
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("returns safe 503 when disconnected", async () => {
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });
    expect((await signup()).code).toBe(503);
    expect(access).not.toHaveBeenCalled();
  });

  it("returns safe 500 for unexpected storage errors", async () => {
    insertOne.mockRejectedValue(new Error("mongodb://secret-host with secret password"));
    const res = await signup();
    expect(res.code).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|mongo/);
  });
});

describe("signup IP limit", () => {
  it("counts malformed requests and refuses the sixth before indexes, hashing or writes", async () => {
    for (let i = 0; i < 5; i++) expect((await signup({})).code).toBe(400);
    const res = await signup();
    expect(res.code).toBe(429);
    expect(res.set).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(access).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect((await signup(valid(), "2.2.2.2")).code).toBe(201);
  });

  it("counts successes as attempts, not only failures", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await signup({ ...valid(), email: `student${i}@school.edu.ph` })).code).toBe(201);
    }
    expect((await signup()).code).toBe(429);
    expect(insertOne).toHaveBeenCalledTimes(5);
  });

  it("expires precisely at 15 minutes", () => {
    const request = { ip: "one" };
    for (let i = 0; i < 5; i++) expect(refuseSignupIfLimited(request, response(), 100)).toBeNull();
    const locked = response();
    refuseSignupIfLimited(request, locked, 100 + SIGNUP_WINDOW_MS - 1);
    expect(locked.code).toBe(429);
    expect(refuseSignupIfLimited(request, response(), 100 + SIGNUP_WINDOW_MS)).toBeNull();
  });

  it("bounds memory, fails closed at capacity, and reclaims expired entries", () => {
    for (let i = 0; i < MAX_SIGNUP_IPS; i++) refuseSignupIfLimited({ ip: String(i) }, response(), 100);
    const blocked = response();
    refuseSignupIfLimited({ ip: "new" }, blocked, 100);
    expect(blocked.code).toBe(429);
    expect(refuseSignupIfLimited({ ip: "0" }, response(), 100)).toBeNull();
    expect(refuseSignupIfLimited({ ip: "new" }, response(), 100 + SIGNUP_WINDOW_MS)).toBeNull();
  });
});
