import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { getAssessor, getStudent } from "./admin.controller.js";
import {
  ACCOUNT_STATUSES,
  readSuspendedFlag,
  setAccountStatus,
  setAccountSuspension
} from "../lib/suspension.js";
import { publishStanding } from "../lib/standingEvents.js";
import { idNumberMatch, readIdNumber } from "../auth/identifier.js";

/**
 * The student and assessor accounts this console manages.
 *
 * It creates them, corrects them and removes them. Provisioning was out of
 * scope until 2026-09-01 — accounts were made outside the system and this
 * console could only fix a misspelled name or a forgotten password. That
 * limitation was lifted deliberately; see the provisioning section below for
 * what a deletion does and does not take with it.
 *
 * Two things are handled carefully because getting them wrong is quiet:
 *
 * Passwords are hashed on the way in and never returned on the way out. There
 * is no endpoint that reads one back, because there is nothing to read — the
 * hash is all that is stored. An empty password field means "leave it alone"
 * rather than "clear it", so an edit to a name cannot silently lock someone out.
 *
 * An ID number may be claimed once across students and assessors, because it is
 * what both sign in with. Login searches Student then Assessor for it, so two
 * accounts sharing one do not compete — the first one found simply wins, and
 * the other can never sign in at all. Refusing the duplicate is the only
 * version of this that has an answer. Emails are held to the same rule across
 * every account collection.
 */

const ADMINS_COLLECTION = "Admin";
const ASSESSORS_COLLECTION = "Assessor";
const STUDENTS_COLLECTION = "Student";

// Matches scripts/hash-passwords.mjs. A hash written at a different cost still
// verifies, but keeping them equal means every stored hash is equally hard.
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);
const text = (value) => String(value ?? "").trim();

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

function serviceUnavailable(response) {
  return response.status(503).json({
    message: "The database is not connected. Set MONGODB_URI and restart the API."
  });
}

function badRequest(response, message) {
  return response.status(400).json({ message });
}

/** "a student", "an assessor" — the collection names decide which. */
const article = (word) => (/^[aeiou]/i.test(word) ? "an" : "a");

function emailTakenMessage(collectionName) {
  const role = collectionName.toLowerCase();
  return `That email already belongs to ${article(role)} ${role} account.`;
}

/**
 * Enough of an email to be a working address rather than a typo.
 *
 * Deliberately loose: the full grammar accepts things no mail server does and
 * rejects things they accept, and an account is not verified by this field
 * anyway. It catches the mistake worth catching — a name typed into the email
 * box.
 */
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Whether this address already belongs to somebody.
 *
 * `exceptId` is the account being edited, so saving a record without changing
 * its email does not collide with itself.
 */
async function emailTaken(email, exceptId = null) {
  const lowered = email.toLowerCase();

  for (const name of [STUDENTS_COLLECTION, ASSESSORS_COLLECTION, ADMINS_COLLECTION]) {
    if (!(await collectionExists(name))) continue;

    const rows = await collection(name).find({}, { projection: { email: 1 } }).toArray();
    const clash = rows.find(
      (row) =>
        text(row.email).toLowerCase() === lowered &&
        (!exceptId || asId(row._id) !== asId(exceptId))
    );
    if (clash) return name;
  }

  return null;
}

/**
 * Which collection, if any, already holds this ID number.
 *
 * Both, not just the one being written: an assessor sharing a student's number
 * could never sign in with it. `exceptId` is the account being edited.
 */
async function idNumberTaken(idNumber, exceptId = null) {
  for (const [name, field] of [
    [STUDENTS_COLLECTION, "student_id"],
    [ASSESSORS_COLLECTION, "assessor_id"]
  ]) {
    if (!(await collectionExists(name))) continue;

    const existing = await collection(name).findOne({ [field]: idNumberMatch(idNumber) });
    if (existing && (!exceptId || asId(existing._id) !== asId(exceptId))) return name;
  }

  return null;
}

function idNumberTakenMessage(collectionName) {
  const role = collectionName.toLowerCase();
  return `That ID number already belongs to ${article(role)} ${role} account.`;
}

/**
 * The uniqueness the application checks, restated to the database.
 *
 * The checks above lose a race between two simultaneous edits; an index does
 * not. Best-effort because the collections predate it — if duplicates are
 * already stored the index cannot be built, and an admin must still be able to
 * work. The application check stands on its own either way.
 */
const indexedCollections = new Set();

async function ensureAccountIndexes(name, numberField) {
  if (indexedCollections.has(name)) return;
  if (!(await collectionExists(name))) return;

  const build = async (key, indexName) => {
    try {
      // Sparse: documents seeded without the field must not all collide on null.
      await collection(name).createIndex(key, { unique: true, sparse: true, name: indexName });
    } catch (_error) {
      // Duplicates already stored. Reported nowhere on purpose — it must not
      // break a page load, and the application check still refuses new ones.
    }
  };

  await build({ email: 1 }, `${name.toLowerCase()}_email_unique`);
  await build({ [numberField]: 1 }, `${name.toLowerCase()}_number_unique`);

  indexedCollections.add(name);
}

/**
 * Applies only the fields a request actually sent, so a form that edits one
 * value cannot blank the others by leaving them out.
 *
 * `password` is the exception that has to be handled rather than mapped: an
 * empty one means "leave it alone", and a supplied one is hashed rather than
 * stored.
 */
async function buildAccountUpdates(body, fields) {
  const updates = {};

  for (const [field, key] of Object.entries(fields)) {
    if (!(key in (body ?? {}))) continue;
    updates[field] = text(body[key]);
  }

  if (text(body?.password)) {
    const password = String(body.password);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    updates.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  return { updates };
}

/** PATCH /api/admin/students/:id — names, email, student number, password. */
export async function updateStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!student) return response.status(404).json({ message: "Student not found." });

  await ensureAccountIndexes(STUDENTS_COLLECTION, "student_id");

  const { updates, error } = await buildAccountUpdates(request.body, {
    first_name: "firstName",
    last_name: "lastName",
    email: "email",
    student_id: "studentNumber"
  });
  if (error) return badRequest(response, error);

  if (Object.keys(updates).length === 0) {
    return badRequest(
      response,
      "Send at least one of firstName, lastName, email, studentNumber or password."
    );
  }

  if ("email" in updates) {
    updates.email = updates.email.toLowerCase();
    if (!looksLikeEmail(updates.email)) return badRequest(response, "Enter a valid email address.");

    const takenBy = await emailTaken(updates.email, student._id);
    if (takenBy) return badRequest(response, emailTakenMessage(takenBy));
  }

  if ("student_id" in updates) {
    // Blank is refused rather than stored: it is what they sign in with.
    updates.student_id = readIdNumber(updates.student_id);
    if (!updates.student_id) return badRequest(response, "An ID number is required.");

    const takenBy = await idNumberTaken(updates.student_id, student._id);
    if (takenBy) return badRequest(response, idNumberTakenMessage(takenBy));
  }

  await collection(STUDENTS_COLLECTION).updateOne({ _id: student._id }, { $set: updates });

  return getStudent(request, response);
}

/**
 * PATCH /api/admin/students/:id/suspension — stop this student signing in, or
 * let them back.
 *
 * Its own endpoint rather than a field on the edit form, because it is not a
 * detail being corrected: it is an action with an effect, and it is the one
 * write here that changes what a student can do rather than what their record
 * says. `loginUser` refuses a suspended account (see auth.controller.js), so
 * this is a real lock and not a label — nothing is deleted, no enrolment moves,
 * and clearing it restores them exactly as they were.
 */
export async function setStudentSuspension(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const suspended = readSuspendedFlag(request.body);
  if (suspended === null) return badRequest(response, "Send suspended: true or false.");

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!student) return response.status(404).json({ message: "Student not found." });

  await setAccountSuspension(STUDENTS_COLLECTION, student, suspended);
  publishStanding(student._id);

  return getStudent(request, response);
}

/** PATCH /api/admin/students/:id/status — { status: "active" | "inactive" | "archived" } */
export async function setStudentStatus(request, response) {
  return setStatus(request, response, STUDENTS_COLLECTION, "Student", getStudent);
}

/** PATCH /api/admin/assessors/:id/status — same as above, for assessors. */
export async function setAssessorStatus(request, response) {
  return setStatus(request, response, ASSESSORS_COLLECTION, "Assessor", getAssessor);
}

// Shared by the two handlers above.
async function setStatus(request, response, collectionName, label, respond) {
  if (!databaseReady()) return serviceUnavailable(response);

  const status = request.body?.status;
  if (!ACCOUNT_STATUSES.includes(status)) {
    return badRequest(response, "Status must be active, inactive or archived.");
  }

  const account = await collection(collectionName).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!account) return response.status(404).json({ message: `${label} not found.` });

  await setAccountStatus(collectionName, account, status);
  publishStanding(account._id); // signs them out of open pages if now locked

  return respond(request, response);
}

/** PATCH /api/admin/assessors/:id — name, email, ID number, password. */
export async function updateAssessor(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await collection(ASSESSORS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  await ensureAccountIndexes(ASSESSORS_COLLECTION, "assessor_id");

  const { updates, error } = await buildAccountUpdates(request.body, {
    full_name: "name",
    email: "email",
    assessor_id: "assessorNumber"
  });
  if (error) return badRequest(response, error);

  if (Object.keys(updates).length === 0) {
    return badRequest(response, "Send at least one of name, email, assessorNumber or password.");
  }

  if ("email" in updates) {
    updates.email = updates.email.toLowerCase();
    if (!looksLikeEmail(updates.email)) return badRequest(response, "Enter a valid email address.");

    const takenBy = await emailTaken(updates.email, assessor._id);
    if (takenBy) return badRequest(response, emailTakenMessage(takenBy));
  }

  if ("assessor_id" in updates) {
    updates.assessor_id = readIdNumber(updates.assessor_id);
    if (!updates.assessor_id) return badRequest(response, "An ID number is required.");

    const takenBy = await idNumberTaken(updates.assessor_id, assessor._id);
    if (takenBy) return badRequest(response, idNumberTakenMessage(takenBy));
  }

  await collection(ASSESSORS_COLLECTION).updateOne({ _id: assessor._id }, { $set: updates });

  return getAssessor(request, response);
}

/**
 * PATCH /api/admin/assessors/:id/suspension — stop this assessor signing in,
 * or let them back.
 *
 * The student version of this, on the other collection. It matters more here
 * than it looks: an assessor holds a grading queue, so locking one out does
 * not empty it — the papers stay assigned and stay unmarked until the account
 * is turned back on or the class is given to someone else. Nothing is deleted,
 * no assignment moves, and clearing it restores them exactly as they were.
 */
export async function setAssessorSuspension(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const suspended = readSuspendedFlag(request.body);
  if (suspended === null) return badRequest(response, "Send suspended: true or false.");

  const assessor = await collection(ASSESSORS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  await setAccountSuspension(ASSESSORS_COLLECTION, assessor, suspended);
  publishStanding(assessor._id);

  return getAssessor(request, response);
}

/* ─────────────────── Creating accounts ─────────────────── */

/**
 * The fields a new account needs, checked once for both kinds.
 *
 * A password is required here in a way it is not on an edit: there is no
 * existing one to leave alone, and an account without one is an account
 * nobody can sign into.
 */
async function newAccountFields(body, { numberField, numberKey, nameFields }) {
  const email = text(body?.email).toLowerCase();
  if (!email) return { error: "An email address is required." };
  if (!looksLikeEmail(email)) return { error: "Enter a valid email address." };

  const takenBy = await emailTaken(email);
  if (takenBy) return { error: emailTakenMessage(takenBy) };

  const password = String(body?.password ?? "");
  if (!password) return { error: "A password is required." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  // Required, so the account can sign in with either its ID number or its email.
  const number = readIdNumber(body?.[numberKey]);
  if (!number) return { error: "An ID number is required." };

  const numberTakenBy = await idNumberTaken(number);
  if (numberTakenBy) return { error: idNumberTakenMessage(numberTakenBy) };

  const names = {};
  for (const [field, key] of Object.entries(nameFields)) {
    const value = text(body?.[key]);
    if (!value) return { error: "A name is required." };
    names[field] = value;
  }

  return {
    document: {
      ...names,
      email,
      [numberField]: number,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      suspended: false,
      createdAt: new Date()
    }
  };
}

/** POST /api/admin/students — { firstName, lastName, email, studentNumber, password } */
export async function createStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  await ensureAccountIndexes(STUDENTS_COLLECTION, "student_id");

  const { document, error } = await newAccountFields(request.body, {
    numberField: "student_id",
    numberKey: "studentNumber",
    nameFields: { first_name: "firstName", last_name: "lastName" }
  });
  if (error) return badRequest(response, error);

  // Enrolment is Classes Management's job, so a new student starts on nothing.
  const inserted = await collection(STUDENTS_COLLECTION).insertOne({
    ...document,
    enrolledCourses: []
  });

  request.params = { ...request.params, id: asId(inserted.insertedId) };
  return getStudent(request, response);
}

/** POST /api/admin/assessors — { name, email, assessorNumber, password } */
export async function createAssessor(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  await ensureAccountIndexes(ASSESSORS_COLLECTION, "assessor_id");

  const { document, error } = await newAccountFields(request.body, {
    numberField: "assessor_id",
    numberKey: "assessorNumber",
    nameFields: { full_name: "name" }
  });
  if (error) return badRequest(response, error);

  const inserted = await collection(ASSESSORS_COLLECTION).insertOne({
    ...document,
    assigned_courses: [],
    assigned_students: []
  });

  request.params = { ...request.params, id: asId(inserted.insertedId) };
  return getAssessor(request, response);
}
