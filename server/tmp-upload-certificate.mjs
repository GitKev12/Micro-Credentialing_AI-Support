// One-time seeding: upload a certificate PDF into a new "Certificate" GridFS
// bucket (Certificate.files / .chunks) and record it in the "Certificate"
// collection, linked to a student. Mirrors how LearningModule PDFs are stored.
// Safe to rerun — a matching certificate (same filename + student) is replaced.
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

dotenv.config();

const CERT = {
  file: "C:/Users/Kevin/Downloads/Certificate_MicroCredentialing.pdf",
  title: "Micro-Credentialing",
  studentId: "6a2f8c01afe387a98b837141" // Chris Jerome Dayan (active demo student)
};

const BUCKET = "Certificate";
const COLLECTION = "Certificate";

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
const certificates = db.collection(COLLECTION);

const filename = path.basename(CERT.file);
const fileSize = fs.statSync(CERT.file).size;

// Student _id may be an ObjectId or a string depending on seeding — match both.
const { ObjectId } = mongoose.Types;
const idCandidates = [CERT.studentId];
if (ObjectId.isValid(CERT.studentId)) idCandidates.push(new ObjectId(CERT.studentId));

// Confirm the student exists so we don't attach an orphaned certificate.
const student = await db
  .collection("Student")
  .findOne({ _id: { $in: idCandidates } });
if (!student) {
  console.log(`!! student ${CERT.studentId} not found — aborting.`);
  await mongoose.disconnect();
  process.exit(1);
}
const studentName = [student.first_name, student.last_name].filter(Boolean).join(" ");

// Replace a previous upload of the same certificate for this student.
const existing = await certificates.findOne({
  filename,
  studentId: CERT.studentId
});
if (existing?.fileId) {
  try {
    await bucket.delete(existing.fileId);
  } catch (_error) {
    // Old file already gone — fine.
  }
}

// Stream the PDF into the Certificate GridFS bucket.
const uploadStream = bucket.openUploadStream(filename, {
  contentType: "application/pdf",
  metadata: { title: CERT.title, studentId: CERT.studentId }
});
await new Promise((resolve, reject) => {
  fs.createReadStream(CERT.file)
    .pipe(uploadStream)
    .on("error", reject)
    .on("finish", resolve);
});

const doc = {
  title: CERT.title,
  filename,
  contentType: "application/pdf",
  fileSize,
  fileId: uploadStream.id,
  bucket: BUCKET,
  studentId: CERT.studentId,
  uploadDate: new Date()
};

if (existing) {
  await certificates.updateOne({ _id: existing._id }, { $set: doc });
  console.log(`replaced Certificate doc ${existing._id}`);
} else {
  const result = await certificates.insertOne(doc);
  doc._id = result.insertedId;
  console.log(`inserted Certificate doc ${result.insertedId}`);
}

console.log(`ok: ${filename} (${fileSize} bytes) -> ${studentName} [${CERT.studentId}]`);
console.log(JSON.stringify({ ...doc, fileId: String(doc.fileId), _id: String(doc._id) }, null, 2));

await mongoose.disconnect();
