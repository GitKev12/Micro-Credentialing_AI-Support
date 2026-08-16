import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { signAuthToken } from "./tokens.js";

const roleCollections = {
  student: "Student",
  assessor: "Assessor",
  admin: "Admin"
};

const roleRoutes = {
  student: "/student",
  assessor: "/assessor",
  admin: "/admin"
};

const identifierFieldsByRole = {
  student: ["email", "student_id", "studentNumber", "username"],
  assessor: ["email", "assessor_id", "assessorNumber", "username"],
  admin: ["email", "admin_id", "employeeNumber", "adminNumber", "username"]
};

const passwordFields = ["password", "passwordHash", "hashedPassword"];

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildIdentifierQuery(identifier, role) {
  const fields = identifierFieldsByRole[role] ?? [];
  return {
    $or: fields.flatMap((field) => {
      const values = [{ [field]: identifier }];
      const normalizedIdentifier = normalize(identifier);
      if (normalizedIdentifier !== identifier) {
        values.push({ [field]: normalizedIdentifier });
      }
      return values;
    })
  };
}

function getStoredPassword(account) {
  for (const field of passwordFields) {
    if (account?.[field]) return String(account[field]);
  }
  return "";
}

/**
 * Bcrypt only.
 *
 * Every account once stored its password as readable text, compared here with
 * `stored === submitted`, so anyone who could read a document could sign in as
 * its owner. `scripts/hash-passwords.mjs` has rewritten every row as a hash and
 * that branch is gone — a document whose password field is not a hash no longer
 * authenticates anything, which is the correct answer for a row that should not
 * exist.
 *
 * bcrypt.compare returns false rather than throwing on a malformed hash, so a
 * bad row fails the login instead of failing the request.
 */
async function isPasswordValid(password, storedPassword) {
  if (!storedPassword) return false;
  return bcrypt.compare(String(password), storedPassword);
}

function toPublicUser(account, role) {
  const identifier =
    account.student_id ||
    account.assessor_id ||
    account.admin_id ||
    account.studentNumber ||
    account.assessorNumber ||
    account.employeeNumber ||
    account.adminNumber ||
    "";

  return {
    id: account._id,
    role,
    identifier,
    displayName:
      account.fullName ||
      account.full_name ||
      account.name ||
      [account.first_name, account.last_name].filter(Boolean).join(" ") ||
      account.username ||
      "",
    email: account.email || "",
    permissions: account.permissions || []
  };
}

function ensureDatabaseReady(response) {
  if (mongoose.connection.readyState === 1) return true;
  response.status(503).json({
    message: "Database is not connected. Check MONGODB_URI and restart the server."
  });
  return false;
}

async function findAccountByRole(identifier, role) {
  const collectionName = roleCollections[role];
  if (!collectionName) return null;
  return mongoose.connection.collection(collectionName).findOne(buildIdentifierQuery(identifier, role));
}

async function findFirstAccountByRoles(identifier, roles) {
  for (const role of roles) {
    const account = await findAccountByRole(identifier, role);
    if (account) return { account, role };
  }
  return null;
}

export async function loginUser(request, response) {
  const { identifier, password } = request.body ?? {};

  if (!identifier || !password) {
    return response.status(400).json({ message: "Email and password are required." });
  }

  if (!ensureDatabaseReady(response)) return null;

  const result = await findFirstAccountByRoles(identifier, ["student", "assessor"]);
  const storedPassword = getStoredPassword(result?.account);

  if (!result || !(await isPasswordValid(password, storedPassword))) {
    return response.status(401).json({ message: "Invalid student or assessor login credentials." });
  }

  return response.json({
    message: "Login successful.",
    token: signAuthToken(result.account, result.role),
    user: toPublicUser(result.account, result.role),
    redirectTo: roleRoutes[result.role]
  });
}

export async function loginAdmin(request, response) {
  const { identifier, password } = request.body ?? {};

  if (!identifier || !password) {
    return response.status(400).json({ message: "Admin email and password are required." });
  }

  if (!ensureDatabaseReady(response)) return null;

  const account = await findAccountByRole(identifier, "admin");
  const storedPassword = getStoredPassword(account);

  if (!account || !(await isPasswordValid(password, storedPassword))) {
    return response.status(401).json({ message: "Invalid admin login credentials." });
  }

  return response.json({
    message: "Login successful.",
    token: signAuthToken(account, "admin"),
    user: toPublicUser(account, "admin"),
    redirectTo: roleRoutes.admin
  });
}
