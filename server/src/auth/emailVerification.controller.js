import crypto from "node:crypto";
import mongoose from "mongoose";
import { checkEmail } from "../lib/fieldRules.js";
import { emailTaken } from "./accountCreation.js";
import { sendSignupCodeEmail } from "./mailer.js";
import { refuseCodeRequestIfLimited, refuseCodeVerifyIfLimited } from "./passwordResetLimit.js";

export const CODE_MINUTES = 10;
export const MAX_WRONG_CODES = 5;
export const RESEND_WAIT_MS = 60 * 1000;
const UNAVAILABLE = "Email verification is temporarily unavailable. Try again later.";
const EXPIRED = "This code has expired or is no longer valid. Ask for a new one.";
const codes = () => mongoose.connection.collection("EmailVerification");
const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");

function hasOnly(body, fields) {
  return Boolean(body) && typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).every((key) => fields.includes(key)) &&
    fields.every((key) => typeof body[key] === "string");
}

// The normalized email is the unique _id; parallel sends cannot create two records.
export async function sendSignupCode(request, response) {
  if (refuseCodeRequestIfLimited(request, response)) return null;
  if (!hasOnly(request.body, ["email"])) {
    return response.status(400).json({ message: "Send only an email address as text." });
  }
  const problem = checkEmail(request.body.email);
  if (problem) return response.status(400).json({ message: problem });
  if (mongoose.connection.readyState !== 1) return response.status(503).json({ message: UNAVAILABLE });

  try {
    const email = request.body.email.trim().toLowerCase();
    if (await emailTaken(email)) {
      return response.status(409).json({ message: "An account with these details already exists." });
    }
    // Expiry is checked in every query too: TTL cleanup is not immediate.
    await codes().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const now = Date.now();
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = hashCode(code);
    const expiresAt = new Date(now + CODE_MINUTES * 60 * 1000);
    try {
      await codes().updateOne(
        { _id: email, sentAt: { $lte: new Date(now - RESEND_WAIT_MS) } },
        { $set: { codeHash, expiresAt, tries: 0, sentAt: new Date(now), ready: false } },
        { upsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      const current = await codes().findOne({ _id: email });
      const retryAfter = Math.max(1, Math.ceil((new Date(current?.sentAt).getTime() + RESEND_WAIT_MS - now) / 1000) || 60);
      response.set?.("Retry-After", String(retryAfter));
      return response.status(429).json({ message: `Wait ${retryAfter} seconds before asking for another code.`, retryAfter });
    }
    try {
      await sendSignupCodeEmail({ to: email, code, minutes: CODE_MINUTES });
      await codes().updateOne({ _id: email, codeHash }, { $set: { ready: true } });
    } catch (error) {
      // An older mail failure must not delete a newer code.
      await codes().deleteOne({ _id: email, codeHash });
      throw error;
    }
    return response.json({ message: "Verification code sent.", expiresAt, resendAfter: 60 });
  } catch {
    return response.status(503).json({ message: UNAVAILABLE });
  }
}

// Wrong guesses through either endpoint use the SAME atomic attempt counter.
// Matching code hashes stay in database filters, never in responses or logs.
async function checkCode(email, code, consume = false) {
  const filter = { _id: email.trim().toLowerCase(), expiresAt: { $gt: new Date() }, tries: { $lt: MAX_WRONG_CODES }, ready: true };
  const codeHash = hashCode(code);
  const wrong = await codes().findOneAndUpdate(
    { ...filter, codeHash: { $ne: codeHash } },
    { $inc: { tries: 1 } },
    { returnDocument: "after", includeResultMetadata: false }
  );
  if (wrong) return { message: wrong.tries >= MAX_WRONG_CODES
    ? "Too many wrong codes. Ask for a new one."
    : "That code is not right. Check the email and try again." };
  const match = { ...filter, expiresAt: { $gt: new Date() }, codeHash };
  const record = consume
    ? await codes().findOneAndDelete(match, { includeResultMetadata: false })
    : await codes().findOne(match);
  return record ? { expiresAt: record.expiresAt } : { message: EXPIRED };
}

export async function verifySignupCode(request, response) {
  if (refuseCodeVerifyIfLimited(request, response)) return null;
  if (!hasOnly(request.body, ["email", "code"])) {
    return response.status(400).json({ message: "Send only email and code as text." });
  }
  const problem = checkEmail(request.body.email);
  if (problem) return response.status(400).json({ message: problem });
  if (!/^\d{6}$/.test(request.body.code)) {
    return response.status(400).json({ message: "Enter the 6-digit code from the email." });
  }
  if (mongoose.connection.readyState !== 1) return response.status(503).json({ message: UNAVAILABLE });
  try {
    const result = await checkCode(request.body.email, request.body.code);
    if (result.message) return response.status(400).json({ message: result.message });
    return response.json({ message: "Email verified.", expiresAt: result.expiresAt });
  } catch {
    return response.status(503).json({ message: UNAVAILABLE });
  }
}

// Signup rechecks the email, expiry and attempt limit while consuming the code.
export async function consumeSignupCode(email, code) {
  if (!/^\d{6}$/.test(code)) return false;
  const result = await checkCode(email, code, true);
  return !result.message;
}
