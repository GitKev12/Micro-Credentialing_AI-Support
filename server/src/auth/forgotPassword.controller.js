import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { checkEmail } from "../lib/fieldRules.js";
import { sendOtpEmail } from "./mailer.js";
import { noteSuccess } from "./loginLimit.js";
import { refuseOtpRequestIfLimited, refuseResetIfLimited } from "./passwordResetLimit.js";

export const OTP_MINUTES = 10;
export const MAX_WRONG_OTPS = 5;
// Asking again within a minute does not send a second email.
export const RESEND_WAIT_MS = 60 * 1000;

const SENT = "If that email belongs to an active student account, an OTP was sent to it.";
const UNAVAILABLE = "Password reset is temporarily unavailable. Try again later.";
const EXPIRED = "This OTP has expired or is no longer valid. Ask for a new one.";
const WRONG = "That OTP is not right. Check the email and try again.";
const TOO_MANY = "Too many wrong OTPs. Ask for a new one.";

// What a pending reset stores on the Student document. Only a hash of the OTP
// is kept, so reading the database does not reveal it.
const OTP_FIELDS = { resetOtpHash: "", resetOtpExpiresAt: "", resetOtpTries: "", resetOtpSentAt: "" };

const students = () => mongoose.connection.collection("Student");
const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");
const time = (value) => (value ? new Date(value).getTime() : 0);

function sameHash(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

// The body must be an object with exactly these fields, each as text.
// Anything else (like { "$ne": "" }) never reaches a database filter.
function hasOnly(body, fields) {
  return Boolean(body) && typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).every((key) => fields.includes(key)) &&
    fields.every((key) => typeof body[key] === "string");
}

// Only a student who is not suspended or archived can reset a password.
function activeStudent(email) {
  const typed = email.trim();
  return {
    email: { $in: [...new Set([typed.toLowerCase(), typed])] },
    suspended: { $ne: true },
    archived: { $ne: true }
  };
}

/** POST /api/auth/forgot-password — { email } */
export async function requestPasswordOtp(request, response) {
  if (refuseOtpRequestIfLimited(request, response)) return null;
  if (!hasOnly(request.body, ["email"])) {
    return response.status(400).json({ message: "Send only an email address as text." });
  }
  const emailError = checkEmail(request.body.email);
  if (emailError) return response.status(400).json({ message: emailError });
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({ message: UNAVAILABLE });
  }

  try {
    const student = await students().findOne(activeStudent(request.body.email));
    const now = Date.now();

    // An unknown email gets the same answer as a real one, so this form
    // cannot be used to check who has an account.
    if (student && now - time(student.resetOtpSentAt) >= RESEND_WAIT_MS) {
      const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      await students().updateOne({ _id: student._id }, {
        $set: {
          resetOtpHash: hashOtp(otp),
          resetOtpExpiresAt: new Date(now + OTP_MINUTES * 60 * 1000),
          resetOtpTries: 0,
          resetOtpSentAt: new Date(now)
        }
      });
      try {
        await sendOtpEmail({ to: student.email, firstName: student.first_name, otp, minutes: OTP_MINUTES });
      } catch (error) {
        // Not sent: forget this OTP so the student can ask again straight away.
        await students().updateOne({ _id: student._id }, { $unset: OTP_FIELDS });
        throw error;
      }
    }
    return response.json({ message: SENT });
  } catch (error) {
    console.error("[forgot password] OTP not sent:", error.message);
    return response.status(503).json({ message: "The OTP email could not be sent. Try again later." });
  }
}

/** POST /api/auth/reset-password — { email, otp, newPassword } */
export async function resetPasswordWithOtp(request, response) {
  if (refuseResetIfLimited(request, response)) return null;
  const body = request.body;
  if (!hasOnly(body, ["email", "otp", "newPassword"])) {
    return response.status(400).json({ message: "Send only email, otp and newPassword as text." });
  }
  const emailError = checkEmail(body.email);
  if (emailError) return response.status(400).json({ message: emailError });
  const otp = body.otp.trim();
  if (!/^\d{6}$/.test(otp)) {
    return response.status(400).json({ message: "Enter the 6-digit OTP from the email." });
  }
  // Same rule as signup. Not trimmed, and bcrypt ignores anything past 72 bytes.
  const password = body.newPassword;
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return response.status(400).json({ message: "The password must be at least 8 characters and at most 72 UTF-8 bytes." });
  }
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({ message: UNAVAILABLE });
  }

  try {
    const student = await students().findOne(activeStudent(body.email));
    if (!student?.resetOtpHash || time(student.resetOtpExpiresAt) <= Date.now()) {
      return response.status(400).json({ message: EXPIRED });
    }

    if (!sameHash(hashOtp(otp), student.resetOtpHash)) {
      if ((student.resetOtpTries ?? 0) + 1 >= MAX_WRONG_OTPS) {
        // Too many guesses: throw this OTP away so a new one has to be asked for.
        await students().updateOne({ _id: student._id }, { $unset: OTP_FIELDS });
        return response.status(400).json({ message: TOO_MANY });
      }
      await students().updateOne({ _id: student._id }, { $inc: { resetOtpTries: 1 } });
      return response.status(400).json({ message: WRONG });
    }

    // Matching the hash as well means the same OTP cannot be used twice.
    const result = await students().updateOne(
      { _id: student._id, resetOtpHash: student.resetOtpHash },
      { $set: { password: await bcrypt.hash(password, 12) }, $unset: OTP_FIELDS }
    );
    if (result.matchedCount === 0) return response.status(400).json({ message: EXPIRED });

    // They proved they own the account, so lift any wrong-password lockout here.
    noteSuccess(request, student.email);
    if (student.student_id) noteSuccess(request, student.student_id);
    return response.json({ message: "Password changed. You can now sign in." });
  } catch (error) {
    console.error("[forgot password] reset failed:", error.message);
    return response.status(503).json({ message: UNAVAILABLE });
  }
}
