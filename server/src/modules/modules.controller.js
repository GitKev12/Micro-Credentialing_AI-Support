import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";

/**
 * Learning modules (lessons) and assessments for a course.
 *
 * Module metadata lives in the LearningModule collection; the lesson files
 * themselves are stored in GridFS (LearningModule.files / .chunks). Expected
 * module document shape:
 *   { _id, title, subject, fileName, fileType, contentType, fileSize,
 *     fileId, bucket, uploadDate, courseCode, courseId }
 *
 * Assessments follow the same lookout pattern as the other endpoints: the
 * Assessment collection has no documents yet, so the list stays empty until
 * assessments are created. Flexible field names are accepted:
 *   { _id, courseId, title, description, status, dueDate }
 */
const MODULES_COLLECTION = "LearningModule";
const ASSESSMENTS_COLLECTION = "Assessment";
const DEFAULT_BUCKET = "LearningModule";

function courseMatch(courseId) {
  return { $or: [{ courseId: { $in: idCandidates(courseId) } }, { courseCode: courseId }] };
}

function toPublicModule(module) {
  return {
    id: module._id,
    title: module.title ?? module.fileName ?? "",
    subject: module.subject ?? module.courseCode ?? "",
    fileName: module.fileName ?? "",
    fileType: module.fileType ?? "",
    fileSize: module.fileSize ?? null,
    uploadDate: module.uploadDate ?? null
  };
}

function toPublicAssessment(assessment) {
  return {
    id: assessment._id,
    title: assessment.title ?? assessment.name ?? "",
    description: assessment.description ?? "",
    status: assessment.status ?? "open",
    dueDate: assessment.dueDate ?? assessment.due_date ?? null
  };
}

export async function getCourseModules(request, response) {
  const courseId = request.params.courseId;

  if (!(await collectionExists(MODULES_COLLECTION))) {
    return response.json({ modules: [], pending: true });
  }

  const modules = await mongoose.connection
    .collection(MODULES_COLLECTION)
    .find(courseMatch(courseId))
    .sort({ title: 1 })
    .toArray();

  return response.json({ modules: modules.map(toPublicModule) });
}

export async function getCourseAssessments(request, response) {
  const courseId = request.params.courseId;

  if (!(await collectionExists(ASSESSMENTS_COLLECTION))) {
    return response.json({ assessments: [], pending: true });
  }

  const assessments = await mongoose.connection
    .collection(ASSESSMENTS_COLLECTION)
    .find(courseMatch(courseId))
    .toArray();

  return response.json({ assessments: assessments.map(toPublicAssessment) });
}

export async function getModuleFile(request, response) {
  const moduleId = request.params.moduleId;

  const module = await mongoose.connection
    .collection(MODULES_COLLECTION)
    .findOne({ _id: { $in: idCandidates(moduleId) } });

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const bucketName = module.bucket ?? DEFAULT_BUCKET;
  const fileDocument = await mongoose.connection
    .collection(`${bucketName}.files`)
    .findOne({ _id: { $in: idCandidates(module.fileId) } });

  if (!fileDocument) {
    return response.status(404).json({ message: "Module file is missing from storage." });
  }

  response.set({
    "Content-Type": module.contentType ?? "application/octet-stream",
    "Content-Length": fileDocument.length,
    "Content-Disposition": `inline; filename="${module.fileName ?? "module"}"`
  });

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  const stream = bucket.openDownloadStream(fileDocument._id);

  stream.on("error", () => {
    if (!response.headersSent) {
      response.status(500).json({ message: "Failed to read the module file." });
    } else {
      response.end();
    }
  });

  return stream.pipe(response);
}
