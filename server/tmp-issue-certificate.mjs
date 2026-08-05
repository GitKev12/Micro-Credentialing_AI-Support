// One-time seeding: issue a micro-credential (and its stamped certificate) to
// a student for the course they are enrolled in.
//
// The real issue path runs through the assessor console:
//   released StudentResult + pending credential -> POST .../credentials/:id/issue
// so this seeds that submission first, then drives the actual endpoint rather
// than writing the certificate behind its back. Everything it creates carries
// source: "seeded-demo" so it can be found and removed again.
//
// Requires the API to be running (npm start). Safe to rerun — the same student
// and course reuse their seeded rows instead of piling up duplicates.
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const STUDENT_NUMBER = process.env.STUDENT ?? "202300001"; // Chris Jerome Dayan
const API = process.env.API ?? "http://localhost:5000/api";
const SEED_TAG = "seeded-demo";

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

const student = await db.collection("Student").findOne({ student_id: STUDENT_NUMBER });
if (!student) {
  console.log(`!! student ${STUDENT_NUMBER} not found`);
  process.exit(1);
}

const name = [student.first_name, student.last_name].filter(Boolean).join(" ");
const enrolled = student.enrolledCourses ?? [];
if (enrolled.length === 0) {
  console.log(`!! ${name} is not enrolled in any course`);
  process.exit(1);
}

const course = await db.collection("Course").findOne({ _id: enrolled[0] });
console.log(`student : ${name} (${student.student_id})`);
console.log(`course  : ${course.courseCode} — ${course.courseName}`);

// The assessor who owns that course signs the certificate.
const assessor = await db.collection("Assessor").findOne({
  assigned_courses: { $in: [course._id, String(course._id)] }
});
if (!assessor) {
  console.log(`!! no assessor is assigned to ${course.courseCode}`);
  process.exit(1);
}
console.log(`assessor: ${assessor.full_name} (${assessor.assessor_id})`);

// The lesson this credential is attached to — its last one, so the credential
// reads as the course's finishing assessment.
const modules = await db
  .collection("LearningModule")
  .find({ courseId: course._id })
  .toArray();
const lastModule = modules[modules.length - 1];

const credentialName = `${course.courseName} Micro-Credential`;

// --- seed the assessment + released submission the issue endpoint needs ---
const assessment = await db.collection("Assessment").findOneAndUpdate(
  { courseId: course._id, source: SEED_TAG },
  {
    $set: {
      moduleId: lastModule?._id ?? null,
      courseId: course._id,
      title: `${course.courseName} Final Assessment`,
      credentialName,
      pointsPerItem: 5,
      totalPoints: 50,
      passMark: 40,
      source: SEED_TAG,
      items: []
    }
  },
  { upsert: true, returnDocument: "after" }
);
const assessmentId = assessment._id ?? assessment.value?._id;

const existing = await db
  .collection("StudentResult")
  .findOne({ studentId: student._id, courseId: course._id, source: SEED_TAG });

const resultId = existing?._id ?? new ObjectId();

await db.collection("StudentResult").updateOne(
  { _id: resultId },
  {
    $set: {
      assessmentId,
      moduleId: lastModule?._id ?? null,
      courseId: course._id,
      studentId: student._id,
      source: SEED_TAG,
      submittedAt: existing?.submittedAt ?? new Date(),
      answers: [],
      aiGrading: { status: "graded", score: 45, items: [] },
      review: {
        status: "released",
        overrides: {},
        finalScore: 45,
        remark: "Seeded for certificate issuing.",
        gradedBy: assessor._id,
        gradedAt: new Date()
      },
      // Back to pending so the endpoint has something to release on a rerun.
      credential: { status: "pending", name: credentialName }
    }
  },
  { upsert: true }
);
console.log(`\nseeded submission ${resultId} (released, credential pending)`);

// --- drive the real issue endpoint ---
const response = await fetch(`${API}/assessors/${assessor._id}/credentials/${resultId}/issue`, {
  method: "POST"
});
const body = await response.json();

console.log(`POST issue -> ${response.status}`);
console.log(JSON.stringify(body, null, 2));

if (body.certificateError) {
  console.log(`\n!! certificate not stamped: ${body.certificateError}`);
} else if (body.certificate) {
  console.log(
    `\nok: certificate stamped -> ${body.certificate.filename}` +
      `\n    download: ${API}/students/${student._id}/certificates/${body.certificate.id}/file`
  );
}

await mongoose.disconnect();
