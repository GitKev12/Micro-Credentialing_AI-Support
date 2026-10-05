import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
const compare = jest.fn(async (password, hash) => password === "correct password" && hash === "bcrypt-hash");
const signAuthToken = jest.fn(() => "signed-token");
jest.unstable_mockModule("bcryptjs", () => ({ default: { compare } }));
jest.unstable_mockModule("../src/auth/tokens.js", () => ({ signAuthToken }));
jest.unstable_mockModule("../src/lib/courseAccess.js", () => ({ loadStudentSuspensions: async () => [] }));
jest.unstable_mockModule("../src/lib/suspension.js", () => ({ loadAccountSuspension: async () => null }));
jest.unstable_mockModule("../src/lib/standingEvents.js", () => ({ onStandingChange: () => () => {} }));
const { loginUser, loginAdmin } = await import("../src/auth/auth.controller.js");
const { resetLoginLimit, MAX_FAILURES } = await import("../src/auth/loginLimit.js");
let rows, lookups;
const matches = (row, filter) => filter.$or
  ? filter.$or.some((part) => matches(row, part))
  : Object.entries(filter).every(([key, rule]) => rule.$in.includes(row[key]));
const login = async (identifier, password = "correct password", handler = loginUser) => {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ ip: "one", body: { identifier, password } }, res);
  return res;
};
beforeEach(() => {
  resetLoginLimit();
  compare.mockClear(); signAuthToken.mockClear();
  rows = {
    Student: [{ _id: "s1", student_id: "STU001", email: "student@example.com", password: "bcrypt-hash", first_name: "Ana", last_name: "Reyes" }],
    Assessor: [{ _id: "a1", assessor_id: "ASS001", email: "assessor@example.com", passwordHash: "bcrypt-hash", full_name: "Ramon Reyes" }],
    Admin: [{ _id: "ad1", admin_id: "ADM001", email: "admin@example.com", hashedPassword: "bcrypt-hash", name: "Admin User", username: "legacy-admin" }]
  };
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  lookups = jest.fn((name) => ({ findOne: async (filter) => rows[name].find((row) => matches(row, filter)) ?? null }));
  mongoose.connection.collection = lookups;
});

describe("unified login", () => {
  it.each([
    ["student@example.com", "student", "Ana Reyes"], ["stu001", "student", "Ana Reyes"],
    ["ASSESSOR@example.com", "assessor", "Ramon Reyes"], ["ass001", "assessor", "Ramon Reyes"],
    ["ADMIN@example.com", "admin", "Admin User"], ["ADM001", "admin", "Admin User"],
    ["legacy-admin", "admin", "Admin User"]
  ])("signs in %s and routes to %s", async (identifier, role, displayName) => {
    const res = await login(identifier);
    expect(res.code).toBe(200);
    expect(res.body.token).toBe("signed-token");
    expect(res.body.redirectTo).toBe(`/${role}`);
    expect(res.body.user).toMatchObject({ role, displayName });
    expect(res.body.user.password).toBeUndefined();
    expect(signAuthToken).toHaveBeenCalledWith(expect.any(Object), role);
    expect(lookups).toHaveBeenCalledTimes(3);
  });

  it.each(["employeeNumber", "adminNumber", "username"])("preserves admin alias %s", async (key) => {
    rows.Admin[0][key] = "legacy-id";
    expect((await login("legacy-id")).body.user.role).toBe("admin");
  });

  it.each([["Student", "Assessor"], ["Student", "Admin"], ["Assessor", "Admin"]])(
    "refuses ambiguous %s/%s email before any password comparison", async (first, second) => {
      rows[first][0].email = "shared@example.com";
      rows[second][0].email = "shared@example.com";
      rows[first][0].password = "different-password-hash";
      const res = await login("shared@example.com");
      expect(res.code).toBe(401);
      expect(res.body).toEqual({ message: "Invalid ID number, email, or password." });
      expect(compare).not.toHaveBeenCalled();
      expect(signAuthToken).not.toHaveBeenCalled();
    });

  it("refuses ID conflicts across student, assessor and admin aliases", async () => {
    rows.Admin[0].username = "STU001";
    expect((await login("STU001")).code).toBe(401);
    rows.Admin = [];
    rows.Assessor[0].assessor_id = "STU001";
    expect((await login("STU001")).code).toBe(401);
    expect(compare).not.toHaveBeenCalled();
  });

  it("never searches another role's password after a mismatch", async () => {
    const res = await login("student@example.com", "wrong password");
    expect(res.code).toBe(401);
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("wrong password", "bcrypt-hash");
  });

  it.each(["Student", "Assessor", "Admin"])("refuses %s suspension and archive only after correct password", async (collection) => {
    const account = rows[collection][0];
    account.suspended = true;
    expect((await login(account.email, "wrong")).code).toBe(401);
    expect((await login(account.email)).code).toBe(403);
    account.suspended = false; account.archived = true;
    expect((await login(account.email)).code).toBe(403);
    expect(signAuthToken).not.toHaveBeenCalled();
  });

  it("counts ambiguous identities towards the existing login limiter", async () => {
    rows.Admin[0].email = rows.Student[0].email;
    for (let i = 0; i < MAX_FAILURES; i++) expect((await login("student@example.com")).code).toBe(401);
    lookups.mockClear();
    expect((await login("student@example.com")).code).toBe(429);
    expect(lookups).not.toHaveBeenCalled();
  });

  it("clears failures on successful login", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await login("admin@example.com", "wrong");
    expect((await login("admin@example.com")).code).toBe(200);
    for (let i = 0; i < MAX_FAILURES; i++) expect((await login("admin@example.com", "wrong")).code).toBe(401);
  });

  it("keeps the legacy admin endpoint role-specific and compatible", async () => {
    rows.Student[0].email = rows.Admin[0].email;
    const res = await login("admin@example.com", "correct password", loginAdmin);
    expect(res.code).toBe(200);
    expect(res.body.user.role).toBe("admin");
    expect(lookups).toHaveBeenCalledTimes(1);
    expect(lookups).toHaveBeenCalledWith("Admin");
    expect((await login("assessor@example.com", "correct password", loginAdmin)).code).toBe(401);
  });

  it("preserves the legacy endpoint limiter and blocks locked admins", async () => {
    rows.Admin[0].archived = true;
    expect((await login("admin@example.com", "correct password", loginAdmin)).code).toBe(403);
    for (let i = 0; i < MAX_FAILURES; i++) await login("admin@example.com", "wrong", loginAdmin);
    expect((await login("admin@example.com", "wrong", loginAdmin)).code).toBe(429);
  });

  it("returns 503 without lookups when disconnected", async () => {
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });
    expect((await login("admin@example.com")).code).toBe(503);
    expect(lookups).not.toHaveBeenCalled();
  });
});
