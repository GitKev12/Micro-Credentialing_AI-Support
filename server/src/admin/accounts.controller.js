import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import {
  emailTaken,
  emailTakenMessage,
  ensureAccountIndexes,
  insertAccount,
  nameError,
  newPassword,
  newAccountFields,
  nextIdNumber
} from "../auth/accountCreation.js";
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
import { MAX_LENGTH, checkEmail, checkLength } from "../lib/fieldRules.js";

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
 * ID numbers and emails must not collide across account collections.
 * Unified sign-in refuses ambiguous identities rather than choosing a role.
 */

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

/**
 * getStudent and getAssessor write the reply. This adds the new password to it,
 * so the admin can see it once. It is never stored unhashed or sent again.
 */
function addPasswordToReply(response, password) {
  const send = response.json.bind(response);
  response.json = (body) => send({ ...body, password });
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
    const tooLong = checkLength(password, "The password", MAX_LENGTH.password);
    if (tooLong) return { error: tooLong };
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
  await removeFrom("PreAssessmentAttempt", { studentId: { $in: keys } });
  // Through the certificates service, so the PDF file goes with the record.
  const certificates = await removeIssuedCertificatesFor(asId(student._id));

  // Taken off every class roster and every Discover request, so no class keeps
  // counting them.
  if (await collectionExists(CLASSES_COLLECTION)) {
    await collection(CLASSES_COLLECTION).updateMany(
      { $or: [{ studentIds: { $in: keys } }, { requestedStudentIds: { $in: keys } }] },
      {
        $pull: {
          studentIds: { $in: keys },
          suspendedStudentIds: { $in: keys },
          requestedStudentIds: { $in: keys }
        }
      }
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
