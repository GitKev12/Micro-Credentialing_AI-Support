/**
 * Drops `schedule.term` from the Class documents that still carry it.
 *
 *   node scripts/strip-class-term.mjs           # report only
 *   node scripts/strip-class-term.mjs --write   # apply
 *
 * The Classes screen no longer has a Term field, for the same reason the
 * accounts lost program and year: this is a **micro-credentialing** system. A
 * term names a registrar's slice of an academic year, and nothing here is
 * scheduled by one — quizzes open per student when a lesson is finished. The
 * value was a display label that is no longer displayed.
 *
 * Only the one key goes; the rest of the schedule label — days, time, room —
 * is left exactly as it is. A document without the key is not an error, so
 * this is safe to re-run.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

async function main() {
  const write = process.argv.includes("--write");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;
  const classes = db.collection("Class");

  const total = await classes.countDocuments({});
  const present = await classes.countDocuments({ "schedule.term": { $exists: true } });
  console.log(`Class — ${total} document(s), schedule.term present on ${present}`);

  if (write && present > 0) {
    const result = await classes.updateMany({}, { $unset: { "schedule.term": "" } });
    console.log(`Unset on ${result.modifiedCount} document(s).`);
  }

  const left = await classes.countDocuments({ "schedule.term": { $exists: true } });
  console.log(write ? `Applied. schedule.term remains on ${left}.` : "Report only. Re-run with --write to apply.");

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
