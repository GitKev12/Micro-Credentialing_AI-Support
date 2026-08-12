/**
 * Replaces stored plaintext passwords with bcrypt hashes.
 *
 *   node scripts/hash-passwords.mjs           # report only
 *   node scripts/hash-passwords.mjs --write   # apply
 *
 * Every Student, Assessor and Admin document held the account's password as
 * readable text, which meant anyone who could read a document could sign in as
 * its owner. This rewrites each one in place as a bcrypt hash.
 *
 * The passwords themselves are not recoverable afterwards — that is the point.
 * `--write` therefore saves the plaintext to a backup file first and prints
 * where it went, so a login that breaks can be traced before the file is
 * deleted. Delete it once sign-in has been checked; while it exists it is the
 * same liability the database just stopped being.
 *
 * Documents already holding a bcrypt hash are counted and skipped, so this is
 * safe to re-run.
 */

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

// Matches server/src/auth/auth.controller.js — the field it reads is the field
// this must write, or the hash lands somewhere login never looks.
const COLLECTIONS = ["Student", "Assessor", "Admin"];
const PASSWORD_FIELDS = ["password", "passwordHash", "hashedPassword"];
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;
const ROUNDS = 12;

function storedPasswordField(account) {
  return PASSWORD_FIELDS.find((field) => account?.[field]) ?? null;
}

async function main() {
  const write = process.argv.includes("--write");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const backup = [];
  const planned = [];
  let alreadyHashed = 0;
  let noPassword = 0;

  for (const name of COLLECTIONS) {
    const collection = mongoose.connection.collection(name);
    const accounts = await collection.find({}).toArray();

    for (const account of accounts) {
      const field = storedPasswordField(account);

      if (!field) {
        noPassword += 1;
        console.warn(`  ${name} ${account._id} has no password field — skipped.`);
        continue;
      }

      const value = String(account[field]);

      if (BCRYPT_PATTERN.test(value)) {
        alreadyHashed += 1;
        continue;
      }

      planned.push({ name, collection, id: account._id, field, value });
      backup.push({
        collection: name,
        _id: String(account._id),
        identifier: account.email || account.student_id || account.username || "",
        field,
        password: value
      });
    }
  }

  console.log(
    `\n${planned.length} to hash, ${alreadyHashed} already hashed, ${noPassword} without a password field.`
  );

  if (!planned.length) {
    await mongoose.disconnect();
    return;
  }

  if (!write) {
    for (const row of planned) {
      console.log(`  would hash ${row.name} ${row.id} (${row.field})`);
    }
    console.log("\nReport only. Re-run with --write to apply.");
    await mongoose.disconnect();
    return;
  }

  const backupPath = path.resolve(
    process.cwd(),
    `plaintext-passwords-backup-${Date.now()}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
  console.log(`\nPlaintext saved to ${backupPath} — delete it once login is verified.`);

  let updated = 0;

  for (const row of planned) {
    const hash = await bcrypt.hash(row.value, ROUNDS);
    await row.collection.updateOne({ _id: row.id }, { $set: { [row.field]: hash } });
    updated += 1;
    console.log(`  hashed ${row.name} ${row.id} (${row.field})`);
  }

  console.log(`\n${updated} password(s) hashed.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
