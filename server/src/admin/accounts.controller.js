import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { getAssessor, getStudent } from "./admin.controller.js";
import { syncAssessorsForCourse } from "./enrollment.sync.js";
import { removeIssuedCertificatesFor } from "../certificates/certificates.service.js";
import { readSuspendedFlag, setAccountSuspension } from "../lib/suspension.js";

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

  return getAssessor(request, response);
}

/* ─────────────────── Creating and removing accounts ───────────────────
 *
 * Added 2026-09-01 at the user's request, replacing the earlier limitation
 * that this console could only edit an account. Both halves are here because
 * they belong together: creating with no way to delete leaves a mistyped
 * account standing forever, and deleting with no way to create is a door with
 * no way back — which is why delete was taken out in the first place.
 *
 * A deletion is costed before it is agreed to, the way a course deletion
 * already is. What goes with a student is theirs alone: their submissions,
 * their lesson completions, their certificates. What stays is everything that
 * is really about a course — an assessor keeps credit for the papers they
 * graded, and a posted assessment belongs to the course rather than to
 * whoever wrote it.
 */

const CLASSES_COLLECTION = "Class";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";
const ISSUED_COLLECTION = "IssuedCertificate";

/** Counts a query without failing on a collection that was never created. */
async function countIn(name, filter) {
  if (!(await collectionExists(name))) return 0;
  return collection(name).countDocuments(filter);
}

async function removeFrom(name, filter) {
  if (!(await collectionExists(name))) return 0;
  const result = await collection(name).deleteMany(filter);
  return result.deletedCount ?? 0;
}

/**
 * The fields a new account needs, checked once for both kinds.
 *
 * A password is required here in a way it is not on an edit: there is no
 * existing one to leave alone, and an account without one is an account
 * nobody can sign into.
 */
async function newAccountFields(body, { collectionName, numberField, numberKey, nameFields }) {
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

  const number = text(body?.[numberKey]);
  if (number && (await numberTaken(collectionName, numberField, number))) {
    return { error: "That ID number is already in use." };
  }

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
      [numberField]: number || null,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      suspended: false,
      createdAt: new Date()
    }
  };
}

/** POST /api/admin/students — { firstName, lastName, email, studentNumber?, password } */
export async function createStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  await ensureAccountIndexes(STUDENTS_COLLECTION, "student_id");

  const { document, error } = await newAccountFields(request.body, {
    collectionName: STUDENTS_COLLECTION,
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

/** POST /api/admin/assessors — { name, email, assessorNumber?, password } */
export async function createAssessor(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  await ensureAccountIndexes(ASSESSORS_COLLECTION, "assessor_id");

  const { document, error } = await newAccountFields(request.body, {
    collectionName: ASSESSORS_COLLECTION,
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

/** GET /api/admin/students/:id/impact — what deleting this student would take. */
export async function getStudentImpact(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!student) return response.status(404).json({ message: "Student not found." });

  const keys = idCandidates(student._id);

  return response.json({
    impact: {
      id: asId(student._id),
      submissions: await countIn(RESULTS_COLLECTION, { studentId: { $in: keys } }),
      completions: await countIn(PROGRESS_COLLECTION, { studentId: { $in: keys } }),
      certificates: await countIn(ISSUED_COLLECTION, { studentId: { $in: keys.map(asId) } }),
      classes: await countIn(CLASSES_COLLECTION, { studentIds: { $in: keys } }),
      enrolled: (student.enrolledCourses ?? []).length
    }
  });
}

/** DELETE /api/admin/students/:id — the account and everything only theirs. */
export async function deleteStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const student = await collection(STUDENTS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!student) return response.status(404).json({ message: "Student not found." });

  const keys = idCandidates(student._id);
  const name = [student.first_name, student.last_name].filter(Boolean).join(" ").trim();
  // Read before the account goes: the resync at the end needs to know which
  // courses to recount, and there is nothing left to ask afterwards.
  const wasEnrolledIn = student.enrolledCourses ?? [];

  const submissions = await removeFrom(RESULTS_COLLECTION, { studentId: { $in: keys } });
  const completions = await removeFrom(PROGRESS_COLLECTION, { studentId: { $in: keys } });
  // Through the certificates service, so the PDF in the bucket goes with the
  // record. Deleting the record alone left the file behind with nothing
  // pointing at it, and nothing that would ever clean it up.
  const certificates = await removeIssuedCertificatesFor(asId(student._id));

  // Taken off every roster rather than left as a dangling id: a class that
  // still listed them would go on counting them in its enrolment.
  if (await collectionExists(CLASSES_COLLECTION)) {
    await collection(CLASSES_COLLECTION).updateMany(
      { studentIds: { $in: keys } },
      { $pull: { studentIds: { $in: keys } } }
    );
  }

  await collection(STUDENTS_COLLECTION).deleteOne({ _id: student._id });

  // `Assessor.assigned_students` is a stored count, not a live one — every
  // class write already refreshes it and a deletion has to as well, or the
  // Students column on Assessors Management keeps counting somebody who is
  // gone. Runs after the delete, because the recount reads the students that
  // are actually there.
  for (const courseId of wasEnrolledIn) {
    await syncAssessorsForCourse(courseId);
  }

  return response.json({
    student: { id: asId(student._id), name: name || student.email || "Student" },
    removed: { submissions, completions, certificates }
  });
}

/** GET /api/admin/assessors/:id/impact — what deleting this assessor would take. */
export async function getAssessorImpact(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await collection(ASSESSORS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const keys = idCandidates(assessor._id);

  return response.json({
    impact: {
      id: asId(assessor._id),
      classes: await countIn(CLASSES_COLLECTION, { assessorIds: { $in: keys } }),
      assigned: (assessor.assigned_courses ?? []).length,
      // Reported so the dialog can say it survives: an issued credential is a
      // record of what happened, not a possession of the account that made it.
      issued: await countIn(RESULTS_COLLECTION, {
        "credential.issuedBy": { $in: keys.map(asId) }
      })
    }
  });
}

/** DELETE /api/admin/assessors/:id — the account, off every class it staffed. */
export async function deleteAssessor(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const assessor = await collection(ASSESSORS_COLLECTION).findOne({
    _id: { $in: idCandidates(request.params.id) }
  });
  if (!assessor) return response.status(404).json({ message: "Assessor not found." });

  const keys = idCandidates(assessor._id);

  if (await collectionExists(CLASSES_COLLECTION)) {
    await collection(CLASSES_COLLECTION).updateMany(
      { assessorIds: { $in: keys } },
      { $pull: { assessorIds: { $in: keys } } }
    );
  }

  // Grades they released and papers they posted stay. Both are facts about a
  // course and its students, and neither stops being true because the account
  // that recorded it has gone.
  await collection(ASSESSORS_COLLECTION).deleteOne({ _id: assessor._id });

  return response.json({
    assessor: { id: asId(assessor._id), name: assessor.full_name ?? assessor.email ?? "Assessor" }
  });
}
