import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import generator from "generate-password";
import { collectionExists } from "../lib/mongo.js";
import { adminLoginFilter, idNumberMatch, readIdNumber } from "./identifier.js";
import { MAX_LENGTH, checkEmail, checkLength, checkName } from "../lib/fieldRules.js";

const collection = (name) => mongoose.connection.collection(name);
const text = (value) => String(value ?? "").trim();
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const ID_PATTERNS = {
  Student: { field: "student_id", prefix: "STU2023300", digits: 3 },
  Assessor: { field: "assessor_id", prefix: "ASS", digits: 3 }
};

export async function emailTaken(email, exceptId = null) {
  const lowered = email.toLowerCase();
  for (const name of ["Student", "Assessor", "Admin"]) {
    if (!(await collectionExists(name))) continue;
    const rows = await collection(name).find({}, { projection: { email: 1 } }).toArray();
    if (rows.some((row) => text(row.email).toLowerCase() === lowered &&
      (!exceptId || String(row._id) !== String(exceptId)))) return name;
  }
  return null;
}

const article = (word) => (/^[aeiou]/i.test(word) ? "an" : "a");
export function emailTakenMessage(collectionName) {
  const role = collectionName.toLowerCase();
  return `That email already belongs to ${article(role)} ${role} account.`;
}

export async function idNumberTaken(idNumber, exceptId = null) {
  for (const [name, field] of [["Student", "student_id"], ["Assessor", "assessor_id"]]) {
    if (!(await collectionExists(name))) continue;
    const existing = await collection(name).findOne({ [field]: idNumberMatch(idNumber) });
    if (existing && (!exceptId || String(existing._id) !== String(exceptId))) return name;
  }
  return null;
}

export function idNumberTakenMessage(collectionName) {
  const role = collectionName.toLowerCase();
  return `That ID number already belongs to ${article(role)} ${role} account.`;
}

// Admin provisioning remains best-effort for legacy collections with duplicates.
// Public signup does not use this cache: it must confirm both unique indexes.
const indexedCollections = new Set();
export async function ensureAccountIndexes(name, numberField, { strict = false } = {}) {
  if (!strict && indexedCollections.has(name)) return;
  if (!strict && !(await collectionExists(name))) return;
  for (const [field, suffix] of [["email", "email"], [numberField, "number"]]) {
    try {
      await collection(name).createIndex({ [field]: 1 }, {
        unique: true, sparse: true, name: `${name.toLowerCase()}_${suffix}_unique`
      });
    } catch (error) {
      if (strict) throw error;
    }
  }
  if (!strict) indexedCollections.add(name);
}

export async function nextIdNumber(collectionName) {
  const { field, prefix, digits } = ID_PATTERNS[collectionName];
  const pattern = new RegExp(`^${prefix}([0-9]+)$`);
  const rows = await collection(collectionName)
    .find({ [field]: { $regex: pattern } }, { projection: { [field]: 1 } }).toArray();
  const highest = Math.max(0, ...rows.map((row) => Number(pattern.exec(row[field])[1])));
  return prefix + String(highest + 1).padStart(digits, "0");
}

export function newPassword() {
  return generator.generate({
    length: 12, numbers: true, uppercase: true, lowercase: true,
    symbols: false, excludeSimilarCharacters: true, strict: true
  });
}

export function nameError(body, nameFields) {
  for (const key of Object.values(nameFields)) {
    if (!(key in (body ?? {}))) continue;
    const label = { firstName: "First name", lastName: "Last name" }[key] ?? "Name";
    const error = checkName(body[key], label);
    if (error) return error;
  }
  return null;
}

// Admin-only contract: import may supply an ID/password; otherwise generate them.
export async function newAccountFields(body, { numberKey, nameFields }) {
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

  const given = String(body?.password ?? "");
  if (given && given.length < MIN_PASSWORD_LENGTH) {
    return { error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const passwordTooLong = checkLength(given, "The password", MAX_LENGTH.password);
  if (passwordTooLong) return { error: passwordTooLong };
  const password = given || newPassword();
  const number = readIdNumber(body?.[numberKey]);
  const numberTooLong = checkLength(number, "The ID number", MAX_LENGTH.idNumber);
  if (numberTooLong) return { error: numberTooLong };
  if (number) {
    const numberTakenBy = await idNumberTaken(number);
    if (numberTakenBy) return { error: idNumberTakenMessage(numberTakenBy) };
  }
  return {
    givenNumber: number || null,
    password: given ? null : password,
    document: { ...names, email, password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      suspended: false, createdAt: new Date() }
  };
}

// Signup checks every role, including Admin's legacy aliases. Separate collection
// indexes cannot make this cross-role check atomic with an administrator's write.
async function generatedNumberTaken(number) {
  if (await idNumberTaken(number)) return true;
  return Boolean(await collection("Admin").findOne(adminLoginFilter(number)));
}

export async function insertAccount(collectionName, document, givenNumber, { checkAllRoles = false } = {}) {
  const { field, prefix, digits } = ID_PATTERNS[collectionName];
  let previous = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let number = givenNumber ?? (await nextIdNumber(collectionName));
    if (!givenNumber && checkAllRoles) {
      // Advance even if only another role owns the candidate, or the mock/write
      // race hasn't appeared in the next read yet.
      const next = Math.max(Number(number.slice(prefix.length)), previous + 1);
      previous = next;
      number = prefix + String(next).padStart(digits, "0");
      if (await generatedNumberTaken(number)) continue;
    }
    try {
      return await collection(collectionName).insertOne({ ...document, [field]: number });
    } catch (error) {
      const duplicateId = error?.code === 11000 &&
        (error.keyPattern?.[field] || error.keyValue?.[field] || String(error.message).includes(field));
      if (!duplicateId || givenNumber) throw error;
    }
  }
  const error = new Error("Couldn't find a free ID number. Try again.");
  error.code = "ACCOUNT_ID_EXHAUSTED";
  throw error;
}
