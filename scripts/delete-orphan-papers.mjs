/**
 * Deletes papers nobody can ever reach.
 *
 *   node scripts/delete-orphan-papers.mjs           # report only
 *   node scripts/delete-orphan-papers.mjs --write   # apply
 *
 * An orphan here is a paper on a course that has no class and no assessor on
 * it, so there is nobody to post it and nobody to sit it. They are left over
 * from courses set up and then abandoned, and they are counted against those
 * courses on the admin's screens as work somebody owes.
 *
 * Three conditions, all of them, or the paper is left alone: never posted,
 * never submitted against, and on a course with no class and no assessor. That
 * makes this safe to re-run and impossible to point at live work — a posted
 * paper is somebody's, and a paper with a submission behind it is the record of
 * what a student was asked.
 *
 * Every document it deletes is written out whole first, so a run can be undone
 * by inserting the backup file back into the collection.
 */

import fs from "node:fs";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const ASSESSMENTS = "Assessment";
const ASSESSORS = "Assessor";
const CLASSES = "Class";
const COURSES = "Course";
const RESULTS = "StudentResult";

const asId = (value) => String(value);

async function main() {
  const write = process.argv.includes("--write");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;

  const [courses, classes, assessors, papers, results] = await Promise.all([
    db.collection(COURSES).find().toArray(),
    db.collection(CLASSES).find({}, { projection: { courseId: 1 } }).toArray(),
    db.collection(ASSESSORS).find({}, { projection: { assigned_courses: 1 } }).toArray(),
    db.collection(ASSESSMENTS).find().toArray(),
    db.collection(RESULTS).find({}, { projection: { assessmentId: 1 } }).toArray()
  ]);

  const taughtCourses = new Set();
  classes.forEach((cls) => taughtCourses.add(asId(cls.courseId)));
  assessors.forEach((assessor) =>
    (assessor.assigned_courses ?? []).forEach((courseId) => taughtCourses.add(asId(courseId)))
  );

  const submitted = new Set(results.map((row) => asId(row.assessmentId)));
  const courseTitle = new Map(
    courses.map((course) => [
      asId(course._id),
      course.title ?? course.courseName ?? course.name ?? asId(course._id)
    ])
  );

  const orphans = papers.filter(
    (paper) =>
      !taughtCourses.has(asId(paper.courseId)) &&
      paper.status !== "posted" &&
      !submitted.has(asId(paper._id))
  );

  console.log(`${papers.length} paper(s) on record, ${orphans.length} on a course nobody teaches`);

  for (const paper of orphans) {
    console.log(
      `  ${asId(paper._id).slice(-6)} | ${(paper.status ?? "unposted").padEnd(8)} | ${courseTitle.get(asId(paper.courseId)) ?? "(no course)"} — ${paper.title ?? "(untitled)"}`
    );
  }

  if (orphans.length === 0 || !write) {
    if (orphans.length > 0) console.log("Report only. Re-run with --write to delete.");
    await mongoose.disconnect();
    return;
  }

  // Whole documents, questions and keys included: inserting this file back is
  // the undo.
  const backup = new URL(`../paper-class-backup-orphans-${Date.now()}.json`, import.meta.url);
  fs.writeFileSync(backup, JSON.stringify(orphans, null, 2));
  console.log(`Backup: ${backup.pathname.replace(/^\//, "")}`);

  const result = await db
    .collection(ASSESSMENTS)
    .deleteMany({ _id: { $in: orphans.map((paper) => paper._id) } });
  console.log(`Deleted ${result.deletedCount} paper(s).`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
