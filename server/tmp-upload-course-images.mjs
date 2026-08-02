// One-time seeding: uploads the course background images into the
// CourseImage GridFS bucket and links them on the Course documents.
// Safe to rerun — a course's previous image is replaced.
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

dotenv.config();

const IMAGE_DIR = "C:/Users/Kevin/Downloads/Course_Images";
const MAPPING = [
  { file: "cc2-java-background.png", courseId: "6a4ca6c19123a0203a3682d1" },
  { file: "enterprise-architecture-background.png", courseId: "6a4ca6c19123a0203a3682d2" },
  { file: "oop.png", courseId: "6a4ca6c19123a0203a3682d3" },
  { file: "Fundamentals-of-BPO102.png", courseId: "6a4ca6c19123a0203a3682d4" },
  { file: "msc.png", courseId: "6a4ca6c29123a0203a3682d5" },
  { file: "principle-of-system-thinking.png", courseId: "6a4ca6c29123a0203a3682d6" }
];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;
const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: "CourseImage" });
const courses = db.collection("Course");

for (const entry of MAPPING) {
  const candidates = [entry.courseId];
  if (ObjectId.isValid(entry.courseId)) candidates.push(new ObjectId(entry.courseId));

  const course = await courses.findOne({ _id: { $in: candidates } });
  if (!course) {
    console.log(`!! course not found for ${entry.file} (${entry.courseId})`);
    continue;
  }

  // Replace any previous image file.
  if (course.imageFileId) {
    try {
      await bucket.delete(course.imageFileId);
    } catch (_error) {
      // Old file already gone — fine.
    }
  }

  const uploadStream = bucket.openUploadStream(entry.file, { contentType: "image/png" });
  await new Promise((resolve, reject) => {
    fs.createReadStream(path.join(IMAGE_DIR, entry.file))
      .pipe(uploadStream)
      .on("error", reject)
      .on("finish", resolve);
  });

  await courses.updateOne(
    { _id: course._id },
    { $set: { imageFileId: uploadStream.id, imageContentType: "image/png" } }
  );
  console.log(`ok: ${entry.file} -> ${course.courseCode?.trim() ?? course.courseName}`);
}

await mongoose.disconnect();
