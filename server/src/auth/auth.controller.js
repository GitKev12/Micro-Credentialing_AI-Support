import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { signAuthToken } from "./tokens.js";
import { loadStudentSuspensions } from "../lib/courseAccess.js";
import { loadAccountSuspension } from "../lib/suspension.js";
import { onStandingChange } from "../lib/standingEvents.js";
import { loginFilter, readIdentifier } from "./identifier.js";

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

// Admin signs in with an email. Students and assessors use their ID number or
// their email — see findLoginAccount.
const identifierFieldsByRole = {
  admin: ["email", "admin_id", "employeeNumber", "adminNumber", "username"]
};

const idNumberFields = {
  student: "student_id",
  assessor: "assessor_id"
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

/**
 * The student or assessor holding this ID number or email.
 *
 * Student is searched first. The account console refuses an ID number or email
 * already used in either collection (see accounts.controller.js), so the order
 * never has to choose between two accounts.
 */
export async function findLoginAccount(identifier) {
  for (const [role, field] of Object.entries(idNumberFields)) {
    const account = await mongoose.connection
      .collection(roleCollections[role])
      .findOne(loginFilter(identifier, field));
    if (account) return { account, role };
  }
  return null;
}

export async function loginUser(request, response) {
  const identifier = readIdentifier(request.body?.identifier);
  const password = request.body?.password;

  if (!identifier || !password) {
    return response
      .status(400)
      .json({ message: "Enter your ID number or email, and your password." });
  }

  if (!ensureDatabaseReady(response)) return null;

  const result = await findLoginAccount(identifier);
  const storedPassword = getStoredPassword(result?.account);

  if (!result || !(await isPasswordValid(password, storedPassword))) {
    return response.status(401).json({ message: "Invalid ID number, email, or password." });
  }

  // Checked after the password, not before: answering "suspended" to a wrong
  // password would tell an outsider the account exists.
  if (result.account.suspended === true) {
    return response.status(403).json({
      message: "This account is suspended. Contact your administrator."
    });
  }

  return response.json({
    message: "Login successful.",
    token: signAuthToken(result.account, result.role),
    user: toPublicUser(result.account, result.role),
    redirectTo: roleRoutes[result.role]
  });
}

/**
 * GET /api/auth/standing — what is closed for the caller, as of now.
 *
 * The client holds what it was told when a screen loaded, and a suspension is
 * written while they are looking at it. This is the question that page can ask
 * again without reloading itself: it is small, it is the same answer for every
 * screen, and it is the only request a student who is doing nothing makes.
 *
 * The account's own standing is not in the body, because it cannot be. A
 * suspended account never reaches this handler — the guard in front of every
 * route in this API refuses it first, with the reason on the refusal (see
 * lib/suspension.js), and that refusal is what the client watches for. Getting
 * an answer at all is the good news.
 *
 * So what is left is the other suspension: this student's place in particular
 * courses, closed by their assessor or by an administrator switching a class
 * off. Both arrive with the `by` that says which, because they are undone by
 * different people and the student is told to go to the right one.
 *
 * A database that cannot be read answers 503 rather than an empty list. The
 * client takes this as the state of things and would otherwise reopen, on
 * screen, a course it had already been told was shut.
 */
export async function getStanding(request, response) {
  // Staff have courses they teach, not a place in one that can be closed.
  if (request.session?.role !== "student") return response.json({ courses: [] });

  if (!ensureDatabaseReady(response)) return null;

  const byCourse = await loadStudentSuspensions(request.session.id);

  return response.json({
    courses: [...byCourse].map(([courseId, suspension]) => ({
      courseId,
      suspended: true,
      by: suspension.by,
      reason: suspension.reason
    }))
  });
}

/**
 * The full answer `streamStanding` pushes, unlike `getStanding`'s: this one
 * names the account's own suspension too, because nothing refuses a request
 * that was never made. A REST call learns "suspended" by being turned away by
 * `requireAuth`; a connection that was already open when the admin flips the
 * switch is never turned away, so the stream has to go check for itself.
 */
async function loadStandingState(session) {
  const [account, byCourse] = await Promise.all([
    loadAccountSuspension(session),
    session.role === "student" ? loadStudentSuspensions(session.id) : Promise.resolve(new Map())
  ]);

  return {
    account: account ? { message: account.reason, by: account.by } : null,
    courses: [...byCourse].map(([courseId, suspension]) => ({
      courseId,
      suspended: true,
      by: suspension.by,
      reason: suspension.reason
    }))
  };
}

/**
 * GET /api/auth/standing/stream — the same answer as `getStanding`, pushed
 * the moment it changes instead of asked for on a timer.
 *
 * Server-Sent Events rather than WebSockets: the traffic only ever runs one
 * way (server tells the browser something changed), so there is nothing a
 * socket would carry that a kept-open response does not, for a fraction of
 * the bookkeeping. Fetched with `?token=` (`requireDownloadAuth`), because
 * `EventSource` cannot attach an Authorization header.
 *
 * The account row is watched by id — `standingEvents.js` — so a write on the
 * admin console or an assessor's roster wakes exactly the connections that
 * might care and nobody else. Ended once the account shows suspended, since
 * nothing else this stream reports can still change after that.
 */
export async function streamStanding(request, response) {
  const session = request.session;

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.flushHeaders?.();

  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
  };

  const push = async () => {
    if (closed) return;
    const state = await loadStandingState(session);
    if (closed) return;
    response.write(`data: ${JSON.stringify(state)}\n\n`);
    // Nothing left for a suspended account to be told — sign-in is refused
    // and every other request already is too.
    if (state.account) close();
  };

  // A dropped middlebox otherwise never notices this connection is dead until
  // the OS times it out. A comment line is invisible to EventSource's message
  // handler and costs the far end nothing to ignore.
  const heartbeat = setInterval(() => {
    if (!closed) response.write(":\n\n");
  }, 20000);

  const unsubscribe = onStandingChange(session.id, () => {
    push().catch(() => close());
  });

  request.on("close", close);

  await push().catch(() => close());
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
