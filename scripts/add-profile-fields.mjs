/**
 * Adds the account fields the admin console edits.
 *
 *   node scripts/add-profile-fields.mjs           # report only
 *   node scripts/add-profile-fields.mjs --write   # apply
 *
 * Student  gains program, year and status.
 * Assessor gains status, and loses department if it has one.
 *
 * Only `status` is given a value — "Active", which is the state every existing
 * account is already shown in. program and year are created empty rather than
 * filled: this script has no way of knowing anyone's course or year level, and
 * a plausible guess written into a student record is worse than a blank the
 * admin can fill in.
 *
 * Existing values are never overwritten, so this is safe to re-run.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const DEFAULT_STATUS = "Active";

async function main() {
  const write = process.argv.includes("--write");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;

  const plan = [
    { name: "Student", fields: { program: "", year: "", status: DEFAULT_STATUS } },
    { name: "Assessor", fields: { status: DEFAULT_STATUS } }
  ];

  for (const { name, fields } of plan) {
    const documents = await db.collection(name).find({}).toArray();
    console.log(`\n${name} — ${documents.length} document(s)`);

    for (const [field, value] of Object.entries(fields)) {
      const missing = documents.filter((doc) => doc[field] === undefined);
      console.log(
        `  ${field.padEnd(8)} missing on ${String(missing.length).padStart(3)} ` +
          `-> set to ${JSON.stringify(value)}`
      );

      if (write && missing.length > 0) {
        await db.collection(name).updateMany(
          { [field]: { $exists: false } },
          { $set: { [field]: value } }
        );
      }
    }
  }

  // Department was removed from the console; drop it so nothing reads a field
  // the interface no longer shows.
  const withDepartment = await db
    .collection("Assessor")
    .countDocuments({ department: { $exists: true } });
  console.log(`\nAssessor.department present on ${withDepartment} document(s) -> removed`);
  if (write && withDepartment > 0) {
    await db.collection("Assessor").updateMany({}, { $unset: { department: "" } });
  }

  console.log(write ? "\nApplied." : "\nReport only. Re-run with --write to apply.");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
