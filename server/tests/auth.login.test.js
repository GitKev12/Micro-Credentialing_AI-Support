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
const { MAX_FAILURES, WINDOW_MS, lockedMinutes, noteFailure, resetLoginLimit } = await import(
  "../src/auth/loginLimit.js"
);

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
  resetLoginLimit();
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
    await loginAdmin({ ip: "1.1.1.1", body: { identifier: { $ne: null }, password: "anything" } }, res);
    expect(res.code).toBe(400);
    expect(lookups).toBe(0);
  });

  it("refuses an object as the password", async () => {
    const res = fakeResponse();
    await loginAdmin({ ip: "1.1.1.1", body: { identifier: "admin@school.edu.ph", password: { $ne: "" } } }, res);
    expect(res.code).toBe(400);
  });

  it("still searches for a normal email", async () => {
    const res = fakeResponse();
    await loginAdmin({ ip: "1.1.1.1", body: { identifier: "admin@school.edu.ph", password: "secret" } }, res);
    expect(res.code).toBe(401);
    expect(lookups).toBe(1);
  });
});

describe("student and assessor sign-in", () => {
  it("refuses an object as the ID number", async () => {
    const res = fakeResponse();
    await loginUser({ ip: "1.1.1.1", body: { identifier: { $ne: "" }, password: "x" } }, res);
    expect(res.code).toBe(400);
    expect(lookups).toBe(0);
  });

  it("refuses an object as the password", async () => {
    const res = fakeResponse();
    await loginUser({ ip: "1.1.1.1", body: { identifier: "andrea001@student.edu.ph", password: ["x"] } }, res);
    expect(res.code).toBe(400);
  });
});

describe("too many wrong passwords", () => {
  const signIn = (ip = "1.1.1.1", identifier = "andrea001@student.edu.ph") => {
    const res = fakeResponse();
    return loginUser({ ip, body: { identifier, password: "wrong" } }, res).then(() => res);
  };

  it("refuses the account from that address after the limit", async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) expect((await signIn()).code).toBe(401);

    const res = await signIn();
    expect(res.code).toBe(429);
    expect(res.body.message).toMatch(/Try again in 15 minutes/);
  });

  it("doesn't lock the same account from another address, or another account", async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) await signIn();

    expect((await signIn("2.2.2.2")).code).toBe(401);
    expect((await signIn("1.1.1.1", "ramon001@assessor.edu.ph")).code).toBe(401);
  });

  it("opens again once the window is over", () => {
    const request = { ip: "3.3.3.3" };
    const start = Date.now();
    for (let i = 0; i < MAX_FAILURES; i += 1) noteFailure(request, "x", start);

    expect(lockedMinutes(request, "x", start)).toBe(15);
    expect(lockedMinutes(request, "x", start + WINDOW_MS)).toBe(0);
  });
});
