import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import crypto from "node:crypto";
import mongoose from "mongoose";

const hash = jest.fn(async () => "new-hash");
jest.unstable_mockModule("bcryptjs", () => ({ default: { hash } }));
const sendOtpEmail = jest.fn(async () => {});
jest.unstable_mockModule("../src/auth/mailer.js", () => ({ sendOtpEmail, mailerReady: () => true }));

const { requestPasswordOtp, resetPasswordWithOtp, OTP_MINUTES } =
  await import("../src/auth/forgotPassword.controller.js");
const { resetPasswordResetLimits, MAX_OTP_REQUESTS, MAX_RESET_TRIES } =
  await import("../src/auth/passwordResetLimit.js");
const { lockedMinutes, noteFailure, resetLoginLimit, MAX_FAILURES } = await import("../src/auth/loginLimit.js");

const SENT = "If that email belongs to an active student account, an OTP was sent to it.";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

let rows, access;
const response = () => ({
  code: 200, body: null, set: jest.fn(),
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});
const matches = (row, filter) => Object.entries(filter).every(([field, rule]) => {
  if (rule?.$in) return rule.$in.includes(row[field]);
  if (rule && typeof rule === "object" && "$ne" in rule) return row[field] !== rule.$ne;
  return row[field] === rule;
});
const askOtp = async (body = { email: "ana@school.edu.ph" }, ip = "1.1.1.1") => {
  const res = response();
  await requestPasswordOtp({ body, ip }, res);
  return res;
};
const reset = async (body, ip = "1.1.1.1") => {
  const res = response();
  await resetPasswordWithOtp({ body, ip }, res);
  return res;
};
// Ask for an OTP and return the one that was "emailed".
const emailedOtp = async () => {
  await askOtp();
  return sendOtpEmail.mock.calls.at(-1)[0].otp;
};
const ana = () => rows.Student[0];

beforeEach(() => {
  resetPasswordResetLimits();
  resetLoginLimit();
  hash.mockClear();
  sendOtpEmail.mockReset();
  sendOtpEmail.mockImplementation(async () => {});
  rows = {
    Student: [{
      _id: "s1", student_id: "STU2023300001", first_name: "Ana", email: "ana@school.edu.ph",
      password: "old-hash", suspended: false, archived: false
    }]
  };
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  access = jest.fn((name) => ({
    findOne: async (filter) => (rows[name] ?? []).find((row) => matches(row, filter)) ?? null,
    updateOne: async (filter, update) => {
      const row = (rows[name] ?? []).find((each) => matches(each, filter));
      if (!row) return { matchedCount: 0 };
      Object.assign(row, update.$set);
      for (const field of Object.keys(update.$unset ?? {})) delete row[field];
      for (const [field, by] of Object.entries(update.$inc ?? {})) row[field] = (row[field] ?? 0) + by;
      return { matchedCount: 1 };
    }
  }));
  mongoose.connection.collection = access;
});

describe("asking for an OTP", () => {
  it("emails a 6-digit OTP to an active student and stores only its hash", async () => {
    const before = Date.now();
    const res = await askOtp({ email: " ANA@School.edu.ph " });

    expect(res.code).toBe(200);
    expect(res.body).toEqual({ message: SENT });
    expect(sendOtpEmail).toHaveBeenCalledWith({
      to: "ana@school.edu.ph", firstName: "Ana", otp: expect.stringMatching(/^\d{6}$/), minutes: OTP_MINUTES
    });
    const { otp } = sendOtpEmail.mock.calls[0][0];
    expect(ana().resetOtpHash).toBe(sha256(otp));
    expect(JSON.stringify(ana())).not.toContain(`"${otp}"`);
    expect(ana().resetOtpTries).toBe(0);
    expect(ana().resetOtpExpiresAt.getTime()).toBeGreaterThanOrEqual(before + OTP_MINUTES * 60 * 1000);
  });

  it.each([
    ["an unknown email", (row) => { row.email = "someone@school.edu.ph"; }],
    ["a suspended student", (row) => { row.suspended = true; }],
    ["an archived student", (row) => { row.archived = true; }]
  ])("gives %s the same answer but sends nothing", async (_label, change) => {
    change(ana());
    const res = await askOtp();
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ message: SENT });
    expect(sendOtpEmail).not.toHaveBeenCalled();
    expect(ana().resetOtpHash).toBeUndefined();
  });

  it.each([undefined, null, [], "text", {}, { email: { $ne: "" } }, { email: ["a@b.com"] },
    { email: "ana@school.edu.ph", role: "admin" }, { email: "bad" }, { email: "s@g.c" }])(
    "refuses a bad body before touching the database (%p)", async (body) => {
      const res = response();
      await requestPasswordOtp({ body, ip: "1.1.1.1" }, res);
      expect(res.code).toBe(400);
      expect(access).not.toHaveBeenCalled();
    });

  it("does not send a second email within a minute", async () => {
    await askOtp();
    await askOtp();
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);

    ana().resetOtpSentAt = new Date(Date.now() - 61 * 1000);
    await askOtp();
    expect(sendOtpEmail).toHaveBeenCalledTimes(2);
  });

  it(`allows ${MAX_OTP_REQUESTS} requests per IP in 15 minutes`, async () => {
    for (let i = 0; i < MAX_OTP_REQUESTS; i += 1) {
      expect((await askOtp({ email: `nobody${i}@school.edu.ph` })).code).toBe(200);
    }
    const res = await askOtp();
    expect(res.code).toBe(429);
    expect(res.set).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect((await askOtp(undefined, "2.2.2.2")).code).toBe(200);
  });

  it("answers 503 and forgets the OTP when the email cannot be sent", async () => {
    sendOtpEmail.mockRejectedValueOnce(new Error("SMTP login failed"));
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await askOtp();
    quiet.mockRestore();
    expect(res.code).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/SMTP/);
    expect(ana().resetOtpHash).toBeUndefined();
    expect(ana().resetOtpSentAt).toBeUndefined();
  });

  it("answers 503 when the database is down", async () => {
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });
    expect((await askOtp()).code).toBe(503);
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });
});

describe("resetting the password with the OTP", () => {
  it("sets the new bcrypt password and clears the OTP", async () => {
    const otp = await emailedOtp();
    const res = await reset({ email: "ana@school.edu.ph", otp, newPassword: "New pass1!" });

    expect(res.code).toBe(200);
    expect(res.body).toEqual({ message: "Password changed. You can now sign in." });
    expect(hash).toHaveBeenCalledWith("New pass1!", 12);
    expect(ana().password).toBe("new-hash");
    for (const field of ["resetOtpHash", "resetOtpExpiresAt", "resetOtpTries", "resetOtpSentAt"]) {
      expect(ana()).not.toHaveProperty(field);
    }
  });

  it("lifts a wrong-password lockout on the email and the ID number", async () => {
    const request = { ip: "1.1.1.1" };
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      noteFailure(request, "ana@school.edu.ph");
      noteFailure(request, "STU2023300001");
    }
    expect(lockedMinutes(request, "ana@school.edu.ph")).toBeGreaterThan(0);

    const otp = await emailedOtp();
    await reset({ email: "ana@school.edu.ph", otp, newPassword: "New pass1!" });
    expect(lockedMinutes(request, "ana@school.edu.ph")).toBe(0);
    expect(lockedMinutes(request, "STU2023300001")).toBe(0);
  });

  it("does not accept the same OTP twice", async () => {
    const otp = await emailedOtp();
    await reset({ email: "ana@school.edu.ph", otp, newPassword: "New pass1!" });
    hash.mockClear();
    const res = await reset({ email: "ana@school.edu.ph", otp, newPassword: "New pass1!" });
    expect(res.code).toBe(400);
    expect(hash).not.toHaveBeenCalled();
  });

  it("counts wrong OTPs and throws the OTP away after 5", async () => {
    const otp = await emailedOtp();
    const wrong = otp === "000000" ? "111111" : "000000";

    for (let i = 1; i <= 4; i += 1) {
      const res = await reset({ email: "ana@school.edu.ph", otp: wrong, newPassword: "New pass1!" });
      expect(res.body).toEqual({ message: "That OTP is not right. Check the email and try again." });
      expect(ana().resetOtpTries).toBe(i);
    }
    const fifth = await reset({ email: "ana@school.edu.ph", otp: wrong, newPassword: "New pass1!" });
    expect(fifth.body).toEqual({ message: "Too many wrong OTPs. Ask for a new one." });
    expect(ana().resetOtpHash).toBeUndefined();

    const late = await reset({ email: "ana@school.edu.ph", otp, newPassword: "New pass1!" });
    expect(late.code).toBe(400);
    expect(ana().password).toBe("old-hash");
  });

  it("refuses an expired OTP", async () => {
    const otp = await emailedOtp();
    ana().resetOtpExpiresAt = new Date(Date.now() - 1000);
    const res = await reset({ email: "ana@school.edu.ph", otp, newPassword: "New pass1!" });
    expect(res.code).toBe(400);
    expect(res.body.message).toMatch(/expired/);
    expect(ana().password).toBe("old-hash");
  });

  it("gives an email with no OTP the same answer as an expired one", async () => {
    const res = await reset({ email: "someone@school.edu.ph", otp: "123456", newPassword: "New pass1!" });
    expect(res.code).toBe(400);
    expect(res.body.message).toMatch(/expired/);
  });

  it("refuses a suspended student even with the right OTP", async () => {
    const otp = await emailedOtp();
    ana().suspended = true;
    expect((await reset({ email: "ana@school.edu.ph", otp, newPassword: "New pass1!" })).code).toBe(400);
    expect(ana().password).toBe("old-hash");
  });

  it.each([
    undefined, [], { email: "ana@school.edu.ph", otp: "123456" },
    { email: "ana@school.edu.ph", otp: 123456, newPassword: "New pass1!" },
    { email: { $ne: "" }, otp: "123456", newPassword: "New pass1!" },
    { email: "ana@school.edu.ph", otp: "123456", newPassword: "New pass1!", role: "admin" },
    { email: "bad", otp: "123456", newPassword: "New pass1!" },
    { email: "ana@school.edu.ph", otp: "12345", newPassword: "New pass1!" },
    { email: "ana@school.edu.ph", otp: "12345a", newPassword: "New pass1!" },
    { email: "ana@school.edu.ph", otp: "123456", newPassword: "short12" },
    { email: "ana@school.edu.ph", otp: "123456", newPassword: "é".repeat(37) }
  ])("refuses a bad body before touching the database (%p)", async (body) => {
    expect((await reset(body)).code).toBe(400);
    expect(access).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it(`allows ${MAX_RESET_TRIES} tries per IP in 15 minutes`, async () => {
    const body = { email: "someone@school.edu.ph", otp: "123456", newPassword: "New pass1!" };
    for (let i = 0; i < MAX_RESET_TRIES; i += 1) expect((await reset(body)).code).toBe(400);
    expect((await reset(body)).code).toBe(429);
    expect((await reset(body, "2.2.2.2")).code).toBe(400);
  });
});
