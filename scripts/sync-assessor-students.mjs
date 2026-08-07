/**
 * Rebuilds Assessor.assigned_students from student enrolment.
 *
 *   node scripts/sync-assessor-students.mjs           # report only
 *   node scripts/sync-assessor-students.mjs --write   # apply
 *
 * The API keeps this field in step from now on (see enrollment.sync.js); this
 * repairs whatever was stored before it did, and is safe to re-run — the field
 * is derived, so a second run over unchanged data writes nothing.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const asId = (value) => String(value);

async function main() {
  const write = process.argv.includes("--write");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;

  const [assessors, students, courses] = await Promise.all([
    db.collection("Assessor").find({}).toArray(),
    db.collection("Student").find({}).toArray(),
    db.collection("Course").find({}).toArray()
  ]);

  const courseLabel = new Map(
    courses.map((course) => [
      asId(course._id),
      (course.courseCode ?? course.code ?? course.courseName ?? course.title ?? "?").trim()
    ])
  );
  const studentName = (student) =>
    [student.first_name, student.last_name].filter(Boolean).join(" ") ||
    student.full_name ||
    student.name ||
    student.email ||
    asId(student._id);

  let changes = 0;

  for (const assessor of assessors) {
    const assigned = (assessor.assigned_courses ?? []).map(asId);
    const wanted = new Set(assigned);

    const matching = students.filter((student) =>
      (student.enrolledCourses ?? []).some((courseId) => wanted.has(asId(courseId)))
    );

    const before = (assessor.assigned_students ?? []).map(asId).sort();
    const after = matching.map((student) => asId(student._id)).sort();
    const same = before.join(",") === after.join(",");

    console.log(
      `${(assessor.assessor_id ?? asId(assessor._id)).padEnd(8)} ` +
        `${String(assessor.full_name ?? "").padEnd(24)} ` +
        `courses[${assigned.map((id) => courseLabel.get(id) ?? id).join(", ") || "none"}]  ` +
        `students ${before.length} -> ${after.length}${same ? "  (unchanged)" : ""}`
    );
    for (const student of matching) {
      console.log(`           + ${studentName(student)}`);
    }

    if (same) continue;
    changes += 1;

    if (write) {
      await db.collection("Assessor").updateOne(
        { _id: assessor._id },
        { $set: { assigned_students: matching.map((student) => student._id) } }
      );
    }
  }

  console.log(
    write
      ? `\nUpdated ${changes} assessor document(s).`
      : `\n${changes} assessor document(s) would change. Re-run with --write to apply.`
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Sync failed:", error.message);
  process.exit(1);
});
