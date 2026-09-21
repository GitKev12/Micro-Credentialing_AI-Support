/**
 * Gives a course's papers to one class, so the other class stops sitting them.
 *
 *   node scripts/assign-papers-to-class.mjs --course <id> --class <id>           # report only
 *   node scripts/assign-papers-to-class.mjs --course <id> --class <id> --write   # apply
 *   …--posted-by "Daniel Cruz"                                                   # narrow to one author
 *
 * A paper carries the class it was written for. A paper with none is the
 * course's own, and every class falls back to it — which is how every paper
 * written before classes existed reaches everybody. That fallback is deliberate
 * and nothing here has to be run: this is for the course where those papers
 * were really one section's work, and sharing them with the other section is
 * wrong rather than merely generous.
 *
 * Only papers with no class are touched, so this cannot take a paper off the
 * class it was written for. It writes a backup of every row it changes first,
 * and prints who has submissions against them — a student who has taken a paper
 * that is about to leave their class is the one thing worth stopping for.
 */

import fs from "node:fs";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const ASSESSMENTS = "Assessment";
const CLASSES = "Class";
const RESULTS = "StudentResult";

/** `--course abc` and `--course=abc` both read. */
function option(name) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index !== -1) return process.argv[index + 1] ?? null;

  const inline = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : null;
}

/** An id is stored as an ObjectId on some rows and as a string on others. */
function idCandidates(value) {
  const text = String(value);
  const out = [text];
  if (mongoose.Types.ObjectId.isValid(text)) out.push(new mongoose.Types.ObjectId(text));
  return out;
}

async function main() {
  const write = process.argv.includes("--write");
  const courseId = option("course");
  const classId = option("class");
  const postedBy = option("posted-by");

  if (!courseId || !classId) {
    console.error("Usage: node scripts/assign-papers-to-class.mjs --course <id> --class <id> [--posted-by <name>] [--write]");
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;

  const cls = await db.collection(CLASSES).findOne({ _id: { $in: idCandidates(classId) } });
  if (!cls) {
    console.error(`No class ${classId}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (String(cls.courseId) !== String(courseId)) {
    console.error(`${cls.name ?? "That class"} is not on course ${courseId}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // The course's own papers, and only those: one already written for a class
  // belongs to it.
  const filter = {
    courseId: { $in: idCandidates(courseId) },
    classId: { $in: [null, ""] },
    ...(postedBy ? { postedBy } : {})
  };

  const affected = await db.collection(ASSESSMENTS).find(filter).toArray();
  console.log(
    `${affected.length} course-wide paper(s)${postedBy ? ` posted by ${postedBy}` : ""} → ${cls.name ?? classId}`
  );

  for (const doc of affected) {
    const lesson = doc.scope === "final" ? "final" : `lesson ${String(doc.moduleId ?? "?").slice(-6)}`;
    console.log(`  ${String(doc._id).slice(-6)}  ${lesson.padEnd(14)} ${doc.status ?? "unposted"}`);
  }

  if (affected.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Who has already taken one of them. A submission by a student outside this
  // class is the case to stop for: their paper is about to leave them.
  const roll = new Set((cls.studentIds ?? []).map((id) => String(id)));
  const results = await db
    .collection(RESULTS)
    .find({ assessmentId: { $in: affected.flatMap((doc) => idCandidates(doc._id)) } })
    .toArray();

  const outside = [...new Set(results.map((row) => String(row.studentId)).filter((id) => !roll.has(id)))];

  console.log(
    `${results.length} submission(s) against them, ${outside.length} from outside ${cls.name ?? "the class"}`
  );

  if (outside.length > 0) {
    console.log(`  students: ${outside.join(", ")}`);
    console.log("  Those students keep their results, but lose the paper behind them.");
  }

  if (!write) {
    console.log("Report only. Re-run with --write to apply.");
    await mongoose.disconnect();
    return;
  }

  // Written before the update, and holding what it takes to undo it: set
  // classId back to null on these ids.
  const backup = new URL(
    `../paper-class-backup-${Date.now()}.json`,
    import.meta.url
  );
  fs.writeFileSync(
    backup,
    JSON.stringify(
      affected.map((doc) => ({
        _id: String(doc._id),
        courseId: String(doc.courseId),
        moduleId: doc.moduleId == null ? null : String(doc.moduleId),
        scope: doc.scope ?? null,
        status: doc.status ?? null,
        postedBy: doc.postedBy ?? null,
        classId: doc.classId ?? null
      })),
      null,
      2
    )
  );
  console.log(`Backup: ${backup.pathname.replace(/^\//, "")}`);

  // The class id goes on as a string, which is what the console writes when it
  // generates a paper for a class.
  const result = await db
    .collection(ASSESSMENTS)
    .updateMany(filter, { $set: { classId: String(cls._id) } });
  console.log(`Applied. ${result.modifiedCount} paper(s) now belong to ${cls.name ?? classId}.`);

  const left = await db.collection(ASSESSMENTS).countDocuments({
    courseId: { $in: idCandidates(courseId) },
    classId: { $in: [null, ""] }
  });
  console.log(`${left} paper(s) on this course are still the course's own.`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
