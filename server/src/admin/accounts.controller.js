import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { getAssessor, getStudent } from "./admin.controller.js";
import { syncAssessorsForCourse } from "./enrollment.sync.js";
import { removeIssuedCertificatesFor } from "../certificates/certificates.service.js";
import {
  ACCOUNT_STATUSES,
  readSuspendedFlag,
  setAccountStatus,
  setAccountSuspension
} from "../lib/suspension.js";
import { publishStanding } from "../lib/standingEvents.js";
import { idNumberMatch, readIdNumber } from "../auth/identifier.js";
import { checkEmail, checkName } from "../lib/fieldRules.js";
import generator from "generate-password";

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
 * New ID numbers count up per role. The letters live here in the code and only
 * the number part grows: STU2023300026, then STU2023300027; ASS017, then ASS018.
 */
const ID_PATTERNS = {
  [STUDENTS_COLLECTION]: { field: "student_id", prefix: "STU2023300", digits: 3 },
  [ASSESSORS_COLLECTION]: { field: "assessor_id", prefix: "ASS", digits: 3 }
};

/** The highest number already used with this role's prefix, plus one. */
async function nextIdNumber(collectionName) {
  const { field, prefix, digits } = ID_PATTERNS[collectionName];
  const pattern = new RegExp(`^${prefix}([0-9]+)$`);

  const rows = await collection(collectionName)
    .find({ [field]: { $regex: pattern } }, { projection: { [field]: 1 } })
    .toArray();
  const highest = Math.max(0, ...rows.map((row) => Number(pattern.exec(row[field])[1])));

  return prefix + String(highest + 1).padStart(digits, "0");
}

/** A random password from the generate-password package (crypto-based). */
function newPassword() {
  return generator.generate({
    length: 12,
    numbers: true,
    uppercase: true,
    lowercase: true,
    symbols: false,
    // No look-alikes such as l, 1, O and 0, so it can be read out and typed.
    excludeSimilarCharacters: true,
    strict: true
  });
}

/**
 * getStudent and getAssessor write the reply. This adds the new password to it,
 * so the admin can see it once. It is never stored unhashed or sent again.
 */
function addPasswordToReply(response, password) {
  const send = response.json.bind(response);
  response.json = (body) => send({ ...body, password });
}

/** Checks each name field with the shared name rule. */
function nameError(body, nameFields) {
  for (const key of Object.values(nameFields)) {
    if (!(key in (body ?? {}))) continue;
    const label = { firstName: "First name", lastName: "Last name" }[key] ?? "Name";
    const error = checkName(body[key], label);
    if (error) return error;
  }
  return null;
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

  if (body?.resetPassword === true) {
    const password = newPassword();
    updates.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return { updates, newPassword: password };
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

  const badName = nameError(request.body, { first_name: "firstName", last_name: "lastName" });
  if (badName) return badRequest(response, badName);

  const { updates, error, newPassword: resetTo } = await buildAccountUpdates(request.body, {
    first_name: "firstName",
    last_name: "lastName",
    email: "email"
    // No student_id: an ID number is made once and can't be changed.
  });
  if (error) return badRequest(response, error);

  if (Object.keys(updates).length === 0) {
    return badRequest(
      response,
      "Send at least one of firstName, lastName, email or resetPassword."
    );
  }

  if ("email" in updates) {
    updates.email = updates.email.toLowerCase();
    const emailError = checkEmail(updates.email);
    if (emailError) return badRequest(response, emailError);

    const takenBy = await emailTaken(updates.email, student._id);
    if (takenBy) return badRequest(response, emailTakenMessage(takenBy));
  }

  await collection(STUDENTS_COLLECTION).updateOne({ _id: student._id }, { $set: updates });

  if (resetTo) addPasswordToReply(response, resetTo);
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

  const badName = nameError(request.body, { full_name: "name" });
  if (badName) return badRequest(response, badName);

  const { updates, error, newPassword: resetTo } = await buildAccountUpdates(request.body, {
    full_name: "name",
    email: "email"
    // No assessor_id: an ID number is made once and can't be changed.
  });
  if (error) return badRequest(response, error);

  if (Object.keys(updates).length === 0) {
    return badRequest(response, "Send at least one of name, email or resetPassword.");
  }

  if ("email" in updates) {
    updates.email = updates.email.toLowerCase();
    const emailError = checkEmail(updates.email);
    if (emailError) return badRequest(response, emailError);

    const takenBy = await emailTaken(updates.email, assessor._id);
    if (takenBy) return badRequest(response, emailTakenMessage(takenBy));
  }

  await collection(ASSESSORS_COLLECTION).updateOne({ _id: assessor._id }, { $set: updates });

  if (resetTo) addPasswordToReply(response, resetTo);
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
 * The create form sends only names and email: the ID number and the password
 * are made here. The student Import still sends its own ID and password from
 * the spreadsheet, and those are used as they are.
 */
async function newAccountFields(body, { numberKey, nameFields }) {
  const badName = nameError(body, nameFields);
  if (badName) return { error: badName };
  const names = {};
  for (const [field, key] of Object.entries(nameFields)) {
    if (!text(body?.[key])) return { error: "A name is required." };
    names[field] = text(body[key]);
  }

  const emailError = checkEmail(body?.email);
  if (emailError) return { error: emailError };
  const email = text(body.email).toLowerCase();

  const takenBy = await emailTaken(email);
  if (takenBy) return { error: emailTakenMessage(takenBy) };

  // From the spreadsheet, or made here.
  const given = String(body?.password ?? "");
  if (given && given.length < MIN_PASSWORD_LENGTH) {
    return { error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const password = given || newPassword();

  const number = readIdNumber(body?.[numberKey]);
  if (number) {
    const numberTakenBy = await idNumberTaken(number);
    if (numberTakenBy) return { error: idNumberTakenMessage(numberTakenBy) };
  }

  return {
    givenNumber: number || null,
    password: given ? null : password, // only a made-up one is shown back
    document: {
      ...names,
      email,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      suspended: false,
      createdAt: new Date()
    }
  };
}

/**
 * Inserts the new account. With no ID number given, it takes the next one; if
 * two admins save at the same moment and both get the same number, the unique
 * index refuses the second, and it simply tries the next number.
 */
async function insertAccount(collectionName, document, givenNumber) {
  const { field } = ID_PATTERNS[collectionName];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const number = givenNumber ?? (await nextIdNumber(collectionName));
    try {
      return await collection(collectionName).insertOne({ ...document, [field]: number });
    } catch (error) {
      const duplicateId = error?.code === 11000 && String(error.message).includes(field);
      if (!duplicateId || givenNumber) throw error;
    }
  }
  throw new Error("Couldn't find a free ID number. Try again.");
}

/**
 * GET /api/admin/students/next-id and /api/admin/assessors/next-id — the
 * number a new account would get, for the create form to show. Another admin
 * saving first can take it; the saved account then gets the one after.
 */
export async function getNextStudentId(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);
  return response.json({ idNumber: await nextIdNumber(STUDENTS_COLLECTION) });
}

export async function getNextAssessorId(_request, response) {
  if (!databaseReady()) return serviceUnavailable(response);
  return response.json({ idNumber: await nextIdNumber(ASSESSORS_COLLECTION) });
}

/** POST /api/admin/students — { firstName, lastName, email } (+ studentNumber, password from Import) */
export async function createStudent(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  await ensureAccountIndexes(STUDENTS_COLLECTION, "student_id");

  const { document, givenNumber, password, error } = await newAccountFields(
    request.body,
    { numberKey: "studentNumber", nameFields: { first_name: "firstName", last_name: "lastName" } }
  );
  if (error) return badRequest(response, error);

  // Enrolment is Classes Management's job, so a new student starts on nothing.
  const inserted = await insertAccount(
    STUDENTS_COLLECTION,
    { ...document, enrolledCourses: [] },
    givenNumber
  );

  if (password) addPasswordToReply(response, password);
  request.params = { ...request.params, id: asId(inserted.insertedId) };
  return getStudent(request, response);
}

/** POST /api/admin/assessors — { name, email } */
export async function createAssessor(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  await ensureAccountIndexes(ASSESSORS_COLLECTION, "assessor_id");

  const { document, givenNumber, password, error } = await newAccountFields(
    request.body,
    { numberKey: "assessorNumber", nameFields: { full_name: "name" } }
  );
  if (error) return badRequest(response, error);

  const inserted = await insertAccount(
    ASSESSORS_COLLECTION,
    { ...document, assigned_courses: [], assigned_students: [] },
    givenNumber
  );

  if (password) addPasswordToReply(response, password);
  request.params = { ...request.params, id: asId(inserted.insertedId) };
  return getAssessor(request, response);
}

/* ─────────────────── Deleting accounts ───────────────────
 *
 * Only an archived account can be deleted, so a delete is always a second,
 * deliberate step after archiving. What goes with a student is theirs alone:
 * submissions, lesson completions and certificates. An assessor's released
 * grades and posted papers stay, because they belong to the course.
 */

const CLASSES_COLLECTION = "Class";
const PROGRESS_COLLECTION = "ModuleProgress";
const RESULTS_COLLECTION = "StudentResult";
const ISSUED_COLLECTION = "IssuedCertificate";

const NOT_ARCHIVED = "Archive this account before deleting it.";

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
  if (student.archived !== true) return response.status(409).json({ message: NOT_ARCHIVED });

  const keys = idCandidates(student._id);
  const name = [student.first_name, student.last_name].filter(Boolean).join(" ").trim();
  // Read before the account goes: the recount at the end needs these courses.
  const wasEnrolledIn = student.enrolledCourses ?? [];

  const submissions = await removeFrom(RESULTS_COLLECTION, { studentId: { $in: keys } });
  const completions = await removeFrom(PROGRESS_COLLECTION, { studentId: { $in: keys } });
  // Through the certificates service, so the PDF file goes with the record.
  const certificates = await removeIssuedCertificatesFor(asId(student._id));

  // Taken off every class roster, so no class keeps counting them.
  if (await collectionExists(CLASSES_COLLECTION)) {
    await collection(CLASSES_COLLECTION).updateMany(
      { studentIds: { $in: keys } },
      { $pull: { studentIds: { $in: keys }, suspendedStudentIds: { $in: keys } } }
    );
  }

  await collection(STUDENTS_COLLECTION).deleteOne({ _id: student._id });

  // Each assessor's student count is stored, so recount it after the delete.
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
      // Shown as something that stays: a released grade outlives the account.
      graded: await countIn(RESULTS_COLLECTION, { "credential.issuedBy": { $in: keys.map(asId) } })
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
  if (assessor.archived !== true) return response.status(409).json({ message: NOT_ARCHIVED });

  const keys = idCandidates(assessor._id);

  if (await collectionExists(CLASSES_COLLECTION)) {
    await collection(CLASSES_COLLECTION).updateMany(
      { assessorIds: { $in: keys } },
      { $pull: { assessorIds: { $in: keys } } }
    );
  }

  // Grades they released and papers they posted stay with the course.
  await collection(ASSESSORS_COLLECTION).deleteOne({ _id: assessor._id });

  return response.json({
    assessor: { id: asId(assessor._id), name: assessor.full_name ?? assessor.email ?? "Assessor" }
  });
}
