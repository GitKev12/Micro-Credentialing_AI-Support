import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import crypto from "node:crypto";

const sendSignupCodeEmail = jest.fn(async () => {});
jest.unstable_mockModule("../src/auth/mailer.js", () => ({ sendSignupCodeEmail }));
const emailTaken = jest.fn(async () => false);
jest.unstable_mockModule("../src/auth/accountCreation.js", () => ({ emailTaken }));

const { sendSignupCode, verifySignupCode, CODE_MINUTES, MAX_WRONG_CODES, RESEND_WAIT_MS } = 
    await import("../src/auth/emailVerification.controller.js");
const { resetSignupLimit } = await import("../src/auth/signupLimit.js");
const { resetPasswordResetLimits } = await import("../src/auth/passwordResetLimit.js");

let rows, collection, access;
const response = () => ({
  code: 200, body: null, set: jest.fn(),
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});
const matches = (row, filter) => Object.entries(filter).every(([field, rule]) => {
  if (rule && typeof rule === "object" && "$ne" in rule) return row[field] !== rule.$ne;
  if (rule && typeof rule === "object" && "$lte" in rule) return row[field] <= rule.$lte;
  if (rule && typeof rule === "object" && "$gt" in rule) return row[field] > rule.$gt;
  return row[field] == rule;
});

beforeEach(() => {
  resetSignupLimit();
  resetPasswordResetLimits();
  sendSignupCodeEmail.mockReset();
  emailTaken.mockReset();
  
  rows = [];
  access = jest.fn((name) => ({
    createIndex: jest.fn(async () => "index"),
    updateOne: jest.fn(async (filter, update, options) => {
        const rowIdx = rows.findIndex(r => matches(r, filter));
        if (rowIdx === -1) {
            if (options?.upsert) {
                rows.push({ _id: filter._id, ...update.$set });
                return { upsertedCount: 1 };
            }
            return { matchedCount: 0 };
        }
        Object.assign(rows[rowIdx], update.$set);
        return { matchedCount: 1 };
    }),
    findOneAndUpdate: jest.fn(async (filter, update) => {
        const rowIdx = rows.findIndex(r => matches(r, filter));
        if (rowIdx === -1) return null;
        Object.assign(rows[rowIdx], update.$inc ? { tries: (rows[rowIdx].tries || 0) + update.$inc.tries } : {});
        return rows[rowIdx];
    }),
    findOne: jest.fn(async (filter) => rows.find(r => matches(r, filter)) || null),
    findOneAndDelete: jest.fn(async (filter) => {
        const rowIdx = rows.findIndex(r => matches(r, filter));
        if (rowIdx === -1) return null;
        return rows.splice(rowIdx, 1)[0];
    }),
    deleteOne: jest.fn(async (filter) => {
        const rowIdx = rows.findIndex(r => matches(r, filter));
        if (rowIdx === -1) return { deletedCount: 0 };
        rows.splice(rowIdx, 1);
        return { deletedCount: 1 };
    })
  }));
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  mongoose.connection.collection = access;
});

describe("email verification controller", () => {
  it("sends a code and upserts to db", async () => {
    const res = response();
    await sendSignupCode({ body: { email: "ana@school.edu.ph" }, ip: "1.1.1.1" }, res);
    expect(res.code).toBe(200);
    expect(sendSignupCodeEmail).toHaveBeenCalled();
    expect(rows.length).toBe(1);
    expect(rows[0].ready).toBe(true);
  });

  it("verifies a right code", async () => {
    const email = "ana@school.edu.ph";
    const code = "123456";
    const now = Date.now();
    rows.push({ 
        _id: email, 
        codeHash: crypto.createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(now + 1000000),
        tries: 0,
        ready: true
    });
    const res = response();
    await verifySignupCode({ body: { email, code }, ip: "1.1.1.1" }, res);
    expect(res.code).toBe(200);
    expect(res.body.message).toBe("Email verified.");
  });
});
