import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";

/**
 * Finding and reading a lesson's PDF in GridFS.
 *
 * Shared by the route that streams the file to the browser and by the
 * background job that extracts its text.
 */
const DEFAULT_BUCKET = "LearningModule";

/** The GridFS file entry for a module's PDF: { bucketName, fileDocument }. */
export async function findModuleFile(module) {
  const bucketName = module.bucket ?? DEFAULT_BUCKET;
  const fileDocument = await mongoose.connection
    .collection(`${bucketName}.files`)
    .findOne({ _id: { $in: idCandidates(module.fileId) } });
  return { bucketName, fileDocument };
}

/** The whole PDF as a Buffer. Throws when the file is missing from storage. */
export async function readModuleFile(module) {
  const { bucketName, fileDocument } = await findModuleFile(module);
  if (!fileDocument) throw new Error("Module file is missing from storage.");

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  const chunks = [];

  return new Promise((resolve, reject) => {
    bucket
      .openDownloadStream(fileDocument._id)
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}
