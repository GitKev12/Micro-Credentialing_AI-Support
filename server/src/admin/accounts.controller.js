import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { getAssessor, getStudent } from "./admin.controller.js";

/**
 * Correcting the details of a student or assessor who already exists.
 *
 * Editing only. Creating and deleting accounts is a stated limitation of this
 * study, so neither has an endpoint here — accounts are provisioned outside the
 * system and this console does not add to or remove from that roster. What it
 * can do is fix a misspelled name, a wrong email or a forgotten password, which
 * is what an admin actually needs between one term and the next.
 *
 * Two things are handled carefully because getting them wrong is quiet:
 *
 * Passwords are hashed on the way in and never returned on the way out. There
 * is no endpoint that reads one back, because there is nothing to read — the
 * hash is all that is stored. An empty password field means "leave it alone"
 * rather than "clear it", so an edit to a name cannot silently lock someone out.
 *
 * An email may be claimed once across every account collection. Login searches
 * Student then Assessor for one identifier, so two accounts sharing an address
 * do not compete — the first one found simply wins, and the other can never
 * sign in at all. Refusing the duplicate is the only version of this that has
 * an answer.
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

/** Whether this ID number is already used inside its own collection. */
async function numberTaken(name, field, value, exceptId = null) {
  const existing = await collection(name).findOne({ [field]: value });
  if (!existing) return false;
  return !exceptId || asId(existing._id) !== asId(exceptId);
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

  if (
    updates.student_id &&
    (await numberTaken(STUDENTS_COLLECTION, "student_id", updates.student_id, student._id))
  ) {
    return badRequest(response, "That ID number is already in use.");
  }

  await collection(STUDENTS_COLLECTION).updateOne({ _id: student._id }, { $set: updates });

  return getStudent(request, response);
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

  if (
    updates.assessor_id &&
    (await numberTaken(ASSESSORS_COLLECTION, "assessor_id", updates.assessor_id, assessor._id))
  ) {
    return badRequest(response, "That ID number is already in use.");
  }

  await collection(ASSESSORS_COLLECTION).updateOne({ _id: assessor._id }, { $set: updates });

  return getAssessor(request, response);
}
