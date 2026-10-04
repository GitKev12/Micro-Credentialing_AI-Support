import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import mongoose from "mongoose";

/*
 * Sign-in reads only plain text. A body like { "$ne": null } would otherwise go
 * straight into the database filter and match the first account.
 */

jest.unstable_mockModule("../src/lib/courseAccess.js", () => ({ loadStudentSuspensions: async () => [] }));
jest.unstable_mockModule("../src/lib/suspension.js", () => ({ loadAccountSuspension: async () => null }));
jest.unstable_mockModule("../src/lib/standingEvents.js", () => ({ onStandingChange: () => () => {} }));

const { loginAdmin, loginUser } = await import("../src/auth/auth.controller.js");

let lookups;

function fakeResponse() {
  return {
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
  };
}

beforeEach(() => {
  lookups = 0;
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  mongoose.connection.collection = () => ({
    findOne: async () => {
      lookups += 1;
      return null;
    }
  });
});

describe("admin sign-in", () => {
  it("refuses an object as the email without searching", async () => {
    const res = fakeResponse();
    await loginAdmin({ body: { identifier: { $ne: null }, password: "anything" } }, res);
    expect(res.code).toBe(400);
    expect(lookups).toBe(0);
  });

  it("refuses an object as the password", async () => {
    const res = fakeResponse();
    await loginAdmin({ body: { identifier: "admin@school.edu.ph", password: { $ne: "" } } }, res);
    expect(res.code).toBe(400);
  });

  it("still searches for a normal email", async () => {
    const res = fakeResponse();
    await loginAdmin({ body: { identifier: "admin@school.edu.ph", password: "secret" } }, res);
    expect(res.code).toBe(401);
    expect(lookups).toBe(1);
  });
});

describe("student and assessor sign-in", () => {
  it("refuses an object as the ID number", async () => {
    const res = fakeResponse();
    await loginUser({ body: { identifier: { $ne: "" }, password: "x" } }, res);
    expect(res.code).toBe(400);
    expect(lookups).toBe(0);
  });

  it("refuses an object as the password", async () => {
    const res = fakeResponse();
    await loginUser({ body: { identifier: "andrea001@student.edu.ph", password: ["x"] } }, res);
    expect(res.code).toBe(400);
  });
});
