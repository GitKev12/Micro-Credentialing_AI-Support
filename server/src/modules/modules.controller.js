import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { extractPdfText } from "./modules.ocr.js";

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

// OCR/text-extraction results are cached here, one document per module, so
// each PDF is only parsed once: { moduleId, fileId, numPages, pages, ... }.
const MODULE_TEXT_COLLECTION = "ModuleText";

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

async function findModule(moduleId) {
  return mongoose.connection
    .collection(MODULES_COLLECTION)
    .findOne({ _id: { $in: idCandidates(moduleId) } });
}

async function findModuleFile(module) {
  const bucketName = module.bucket ?? DEFAULT_BUCKET;
  const fileDocument = await mongoose.connection
    .collection(`${bucketName}.files`)
    .findOne({ _id: { $in: idCandidates(module.fileId) } });
  return { bucketName, fileDocument };
}

export async function getModuleFile(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const { bucketName, fileDocument } = await findModuleFile(module);

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

function readGridFsBuffer(bucketName, fileId) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  const chunks = [];

  return new Promise((resolve, reject) => {
    bucket
      .openDownloadStream(fileId)
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function toTextResponse(record, cached) {
  return {
    id: record.moduleId,
    title: record.title,
    numPages: record.numPages,
    hasText: record.hasText,
    source: record.source,
    textLength: record.textLength,
    pages: record.pages,
    extractedAt: record.extractedAt,
    cached
  };
}

export async function getModuleText(request, response) {
  const module = await findModule(request.params.moduleId);

  if (!module) {
    return response.status(404).json({ message: "Learning module not found." });
  }

  const moduleKey = String(module._id);
  const fileKey = String(module.fileId ?? "");
  const textCollection = mongoose.connection.collection(MODULE_TEXT_COLLECTION);

  // Serve the cached extraction unless the module's file was replaced.
  const cachedRecord = await textCollection.findOne({ moduleId: moduleKey });
  if (cachedRecord && cachedRecord.fileId === fileKey) {
    return response.json(toTextResponse(cachedRecord, true));
  }

  const isPdf =
    (module.contentType ?? "").includes("pdf") ||
    (module.fileType ?? "").toLowerCase() === "pdf";

  if (!isPdf) {
    return response.json({
      id: module._id,
      title: module.title ?? "",
      numPages: 0,
      hasText: false,
      source: "unsupported-type",
      textLength: 0,
      pages: [],
      cached: false
    });
  }

  const { bucketName, fileDocument } = await findModuleFile(module);

  if (!fileDocument) {
    return response.status(404).json({ message: "Module file is missing from storage." });
  }

  let extracted;
  try {
    const buffer = await readGridFsBuffer(bucketName, fileDocument._id);
    extracted = await extractPdfText(buffer);
  } catch (error) {
    console.error(`Text extraction failed for module ${moduleKey}:`, error.message);
    return response.status(500).json({ message: "Failed to extract text from this module." });
  }

  const record = {
    moduleId: moduleKey,
    fileId: fileKey,
    title: module.title ?? "",
    numPages: extracted.numPages,
    pages: extracted.pages,
    textLength: extracted.textLength,
    hasText: extracted.hasText,
    source: extracted.hasText ? "embedded-text" : "none",
    extractedAt: new Date()
  };

  await textCollection.updateOne(
    { moduleId: moduleKey },
    { $set: record },
    { upsert: true }
  );

  return response.json(toTextResponse(record, false));
}
