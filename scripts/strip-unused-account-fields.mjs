/**
 * Strips the fields the admin console no longer has any use for.
 *
 *   node scripts/strip-unused-account-fields.mjs           # report only
 *   node scripts/strip-unused-account-fields.mjs --write   # apply
 *
 * Student  loses program, year and status.
 * Assessor loses status and department.
 *
 * This script once added program and year. It does the opposite now, and the
 * reason is the same one that removed `status` and `department` before them:
 * the study is about **micro-credentialing**. A credential is earned per lesson
 * and per course. A degree program, a year level and an enrolment state all
 * describe a registrar's view of a student, answer no question this system
 * asks, and were displayed nowhere — every one of them was a field to keep
 * true for no return.
 *
 * A missing field is not an error, so this is safe to re-run.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

// Fields the console no longer shows, unset wherever they survive.
const REMOVED = [
  { name: "Student", fields: ["program", "year", "status"] },
  { name: "Assessor", fields: ["status", "department"] }
];

async function main() {
  const write = process.argv.includes("--write");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;

  for (const { name, fields } of REMOVED) {
    console.log(`\n${name} — fields to drop`);

    for (const field of fields) {
      const present = await db.collection(name).countDocuments({ [field]: { $exists: true } });
      console.log(`  - ${field.padEnd(10)} present on ${String(present).padStart(3)} -> removed`);

      if (write && present > 0) {
        await db.collection(name).updateMany({}, { $unset: { [field]: "" } });
      }
    }
  }

  console.log(write ? "\nApplied." : "\nReport only. Re-run with --write to apply.");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
