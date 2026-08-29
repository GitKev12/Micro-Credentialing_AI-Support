/**
 * Fills in a course's run — the start and end dates the cards read.
 *
 *   node scripts/set-course-dates.mjs 2026-08-04 2026-10-10            # report only
 *   node scripts/set-course-dates.mjs 2026-08-04 2026-10-10 --write    # apply to every course
 *   node scripts/set-course-dates.mjs 2026-08-04 2026-10-10 --write --only CC2,IT214
 *   node scripts/set-course-dates.mjs --list                           # what is stored now
 *
 * The API has required both dates since the field was added, so this is for the
 * courses that were created before it — nothing else writes them in bulk.
 *
 * Report first, write second: run it without --write to see exactly which
 * courses would change and from what, then re-run with it. By default a course
 * that already has a run is left alone; --overwrite includes those too, and
 * says what it is replacing.
 *
 * Dates are stored at UTC midnight, the same as the API stores them (see
 * server/src/lib/courseDates.js) — the day is the fact, not the hour.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const utcDay = (text) => new Date(`${text}T00:00:00.000Z`);

const codeOf = (course) => String(course.courseCode ?? course.code ?? "").trim();
const titleOf = (course) => course.courseName ?? course.title ?? course.name ?? "(untitled)";
const dayOf = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "—");

function readArgs(argv) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const dates = argv.filter((arg) => !arg.startsWith("--"));
  const onlyFlag = argv.findIndex((arg) => arg === "--only");

  return {
    list: flags.includes("--list"),
    write: flags.includes("--write"),
    overwrite: flags.includes("--overwrite"),
    only:
      onlyFlag >= 0 && argv[onlyFlag + 1]
        ? argv[onlyFlag + 1]
            .split(",")
            .map((code) => code.trim().toLowerCase())
            .filter(Boolean)
        : null,
    startsOn: dates[0],
    endsOn: dates[1]
  };
}

async function main() {
  const options = readArgs(process.argv.slice(2));

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  if (!options.list) {
    if (!DAY.test(options.startsOn ?? "") || !DAY.test(options.endsOn ?? "")) {
      console.error("Give both dates as YYYY-MM-DD, e.g. 2026-08-04 2026-10-10.");
      process.exit(1);
    }
    if (utcDay(options.endsOn) < utcDay(options.startsOn)) {
      console.error("The end date is before the start date.");
      process.exit(1);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const courses = await mongoose.connection.collection("Course").find({}).toArray();

  if (options.list) {
    console.log(`${courses.length} course(s):`);
    for (const course of courses) {
      console.log(
        `  ${(codeOf(course) || "(no code)").padEnd(10)} ${dayOf(course.startsOn)} → ${dayOf(
          course.endsOn
        )}  ${titleOf(course)}`
      );
    }
    await mongoose.disconnect();
    return;
  }

  const startsOn = utcDay(options.startsOn);
  const endsOn = utcDay(options.endsOn);

  const chosen = courses.filter((course) => {
    if (options.only && !options.only.includes(codeOf(course).toLowerCase())) return false;
    if (course.startsOn && course.endsOn && !options.overwrite) return false;
    return true;
  });

  const skipped = courses.length - chosen.length;

  console.log(
    `${options.write ? "Writing" : "Would write"} ${options.startsOn} → ${options.endsOn} ` +
      `to ${chosen.length} of ${courses.length} course(s)` +
      (skipped ? `, leaving ${skipped} alone.` : ".")
  );

  for (const course of chosen) {
    console.log(
      `  ${(codeOf(course) || "(no code)").padEnd(10)} ${dayOf(course.startsOn)} → ${dayOf(
        course.endsOn
      )}   becomes   ${options.startsOn} → ${options.endsOn}   ${titleOf(course)}`
    );
  }

  if (!options.write) {
    console.log("\nNothing was changed. Re-run with --write to apply.");
    await mongoose.disconnect();
    return;
  }

  if (chosen.length > 0) {
    const result = await mongoose.connection
      .collection("Course")
      .updateMany(
        { _id: { $in: chosen.map((course) => course._id) } },
        { $set: { startsOn, endsOn } }
      );
    console.log(`\nUpdated ${result.modifiedCount} course(s).`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
