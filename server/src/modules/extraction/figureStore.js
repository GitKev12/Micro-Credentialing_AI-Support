import mongoose from "mongoose";

/**
 * Saving a lesson's cropped figures.
 *
 * One PNG per figure in the ModuleFigure GridFS bucket, tagged with
 * metadata.moduleId so the next extraction (or deleting the lesson) can find
 * and replace them.
 */
const MODULE_FIGURES_BUCKET = "ModuleFigure";

function figuresBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: MODULE_FIGURES_BUCKET
  });
}

/** Deletes every figure stored for this lesson. */
export async function removeModuleFigures(moduleId) {
  const bucket = figuresBucket();
  const previous = await bucket.find({ "metadata.moduleId": String(moduleId) }).toArray();
  await Promise.all(previous.map((file) => bucket.delete(file._id).catch(() => {})));
}

/**
 * Stores a lesson's freshly cropped figures, replacing any from an earlier
 * extraction. Returns `[{ fileId, page, width, height, top }]` for the lesson
 * blocks to point at.
 */
export async function storeModuleFigures(moduleId, figures) {
  const key = String(moduleId);
  await removeModuleFigures(key);

  const bucket = figuresBucket();
  const stored = [];

  for (const figure of figures) {
    const fileId = await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(`fig-${key}-p${figure.page}-${figure.order}.png`, {
        contentType: "image/png",
        metadata: { moduleId: key, page: figure.page }
      });
      upload.on("error", reject).on("finish", () => resolve(upload.id));
      upload.end(figure.png);
    });

    stored.push({
      fileId: String(fileId),
      page: figure.page,
      width: figure.width,
      height: figure.height,
      top: figure.top ?? null
    });
  }

  return stored;
}
