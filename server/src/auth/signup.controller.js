import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { emailTaken, ensureAccountIndexes, insertAccount } from "./accountCreation.js";
import { checkEmail, checkName } from "../lib/fieldRules.js";
import { refuseSignupIfLimited } from "./signupLimit.js";
import { consumeSignupCode } from "./emailVerification.controller.js";
import { passwordProblem } from "./passwordRule.js";

const FIELDS = ["firstName", "lastName", "email", "password", "code"];
const UNAVAILABLE = "Signup is temporarily unavailable. Try again later.";
const DUPLICATE = "An account with these details already exists.";

export async function signupStudent(request, response) {
  // Count invalid requests too, before any database or bcrypt work.
  if (refuseSignupIfLimited(request, response)) return null;
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some((key) => !FIELDS.includes(key)) ||
    FIELDS.some((key) => !Object.hasOwn(body, key) || typeof body[key] !== "string")) {
    return response.status(400).json({ message: "Send only firstName, lastName, email, password and code as text." });
  }
  const error = checkName(body.firstName, "First name") ||
    checkName(body.lastName, "Last name") || checkEmail(body.email);
  if (error) return response.status(400).json({ message: error });

  // Check the same password rules as the reset form.
  const weak = passwordProblem(body.password);
  if (weak) return response.status(400).json({ message: weak });

  if (!body.code || typeof body.code !== "string") {
    return response.status(400).json({ message: "Verify your email first." });
  }
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({ message: UNAVAILABLE });
  }
  try {
    // Bypass the best-effort admin cache: both unique indexes must succeed.
    await ensureAccountIndexes("Student", "student_id", { strict: true });
  } catch {
    return response.status(503).json({ message: UNAVAILABLE });
  }
  try {
    const email = body.email.trim().toLowerCase();
    if (await emailTaken(email)) return response.status(409).json({ message: DUPLICATE });

    // The code can only be used once, for this exact email address.
    if (!await consumeSignupCode(email, body.code)) {
      return response.status(400).json({ message: "Verify your email first." });
    }
    await insertAccount("Student", {
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      email,
      password: await bcrypt.hash(body.password, 12),
      suspended: false,
      archived: false,
      enrolledCourses: [],
      createdAt: new Date()
    }, null, { checkAllRoles: true });
    return response.status(201).json({ message: "Account created. You can now sign in." });
  } catch (error) {
    if (error?.code === 11000) return response.status(409).json({ message: DUPLICATE });
    if (error?.code === "ACCOUNT_ID_EXHAUSTED" || mongoose.connection.readyState !== 1) {
      return response.status(503).json({ message: UNAVAILABLE });
    }
    return response.status(500).json({ message: "Signup failed. Try again later." });
  }
}
