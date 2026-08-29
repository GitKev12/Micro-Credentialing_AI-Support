/**
 * Builds the Class list from the enrolment already in the database.
 *
 *   node scripts/seed-classes.mjs           # report only
 *   node scripts/seed-classes.mjs --write   # create the missing classes
 *
 * The Classes screen reads the `Class` collection, which is empty on this
 * database — every assessor assignment and student enrolment here predates the
 * screen and lives where it always has, on `Assessor.assigned_courses` and
 * `Student.enrolledCourses`. This reads those two fields back and writes one
 * class per course, so the screen shows what is actually there instead of an
 * empty table.
 *
 * One class per course, because that is all the data supports: nothing in this
 * system records sections, so inventing "Section A" and "Section B" would be
 * inventing enrolment. The class is named after the course code and can be
 * renamed on the screen afterwards.
 *
 * Safe to re-run: a course that already has a class is left alone, and nothing
 * here touches the two enrolment fields — it only writes the Class documents
 * that describe them. Nothing is written to the activity log either; that log
 * records what an admin does on the screen, and backfilling assignments made
 * months ago as if they happened just now would be a false history.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const asId = (value) => String(value);

const codeOf = (course) => String(course.courseCode ?? course.code ?? "").trim();
const titleOf = (course) => course.courseName ?? course.title ?? course.name ?? "(untitled)";

const nameOf = (person) =>
  [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
  person.full_name ||
  person.name ||
  person.email ||
  "Unnamed";

/** Whether a person's course list holds this course, by id in either form. */
const holds = (list, courseId) => (list ?? []).some((id) => asId(id) === asId(courseId));

async function main() {
  const write = process.argv.includes("--write");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;

  const [courses, assessors, students, existing] = await Promise.all([
    db.collection("Course").find({}).toArray(),
    db.collection("Assessor").find({}).toArray(),
    db.collection("Student").find({}).toArray(),
    db.collection("Class").find({}).toArray()
  ]);

  const taken = new Set(existing.map((cls) => asId(cls.courseId)));
  const now = new Date();
  const planned = [];

  for (const course of courses) {
    const mine = {
      assessors: assessors.filter((a) => holds(a.assigned_courses, course._id)),
      students: students.filter((s) => holds(s.enrolledCourses, course._id))
    };

    const already = taken.has(asId(course._id));
    const label = `${(codeOf(course) || "(no code)").padEnd(14)} ${titleOf(course)}`;

    if (already) {
      console.log(`  skip   ${label}  — a class already covers this course`);
      continue;
    }

    console.log(
      `  build  ${label}\n` +
        `           assessors: ${mine.assessors.map(nameOf).join(", ") || "none"}\n` +
        `           students:  ${mine.students.map(nameOf).join(", ") || "none"}`
    );

    planned.push({
      name: codeOf(course) || titleOf(course),
      courseId: course._id,
      assessorIds: mine.assessors.map((a) => a._id),
      studentIds: mine.students.map((s) => s._id),
      schedule: { days: "", time: "", room: "" },
      createdAt: now,
      updatedAt: now
    });
  }

  console.log(
    `\n${write ? "Creating" : "Would create"} ${planned.length} class(es) ` +
      `from ${courses.length} course(s); ${existing.length} already exist.`
  );

  if (!write) {
    console.log("Nothing was changed. Re-run with --write to apply.");
  } else if (planned.length > 0) {
    const result = await db.collection("Class").insertMany(planned);
    console.log(`Created ${result.insertedCount} class(es).`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
