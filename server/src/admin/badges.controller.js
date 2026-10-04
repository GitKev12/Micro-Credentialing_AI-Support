import mongoose from "mongoose";
import { idCandidates } from "../lib/mongo.js";
import { sortLessons } from "../lib/lessonOrder.js";
import { imageTypeOf } from "./modules.controller.js";

/**
 * Adding a badge to one lesson, the Moodle way: the admin names it, gives it
 * a picture and a description, and turns on "Enable access" when it is ready.
 *
 * The rule is fixed: a student earns it by passing that lesson's quiz.
 * Who has earned it is worked out from their quiz results (badges.service),
 * so nothing here writes per-student records.
 */

const BADGES_COLLECTION = "Badge";
const COURSES_COLLECTION = "Course";
const MODULES_COLLECTION = "LearningModule";

// Badges are drawn small, so the picture is kept small too.
export const MAX_BADGE_ICON_BYTES = 100 * 1024;

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

function serviceUnavailable(response) {
  return response.status(503).json({
    message: "The database is not connected. Set MONGODB_URI and restart the API."
  });
}

function courseCode(course) {
  return (course?.courseCode ?? course?.code ?? "").trim();
}

/** The badge as the admin screens read it. */
export function publicBadge(badge) {
  if (!badge) return null;
  return {
    id: asId(badge._id),
    title: badge.title ?? badge.lessonTitle ?? "",
    description: badge.description ?? "",
    icon: badge.icon ?? null,
    active: badge.active !== false
  };
}

/**
 * Turns a "data:…;base64,…" picture into a clean data URI, or returns an error.
 * The bytes decide the type, not what the browser said, same as course pictures.
 */
export function readBadgeIcon(dataUrl) {
  const match = /^data:[^;,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl ?? ""));
  if (!match) return { error: "The badge picture must be an image file." };

  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > MAX_BADGE_ICON_BYTES) {
    return { error: "The badge picture is too large. The limit is 100 KB." };
  }

  // An SVG is text, so it is checked by its opening tag.
  const text = bytes.subarray(0, 512).toString("utf8").trimStart();
  const isSvg = /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);
  const type = isSvg ? "image/svg+xml" : imageTypeOf(bytes);
  if (!type) return { error: "The badge picture must be a PNG, JPEG, WebP, GIF or SVG." };

  return { icon: `data:${type};base64,${bytes.toString("base64")}` };
}

async function findModule(moduleId) {
  return collection(MODULES_COLLECTION).findOne({ _id: { $in: idCandidates(moduleId) } });
}

/** The lesson's place in its course (1, 2, 3…), used to order the badge wall. */
async function lessonOrder(module) {
  const siblings = await collection(MODULES_COLLECTION)
    .find(
      module.courseId
        ? { courseId: { $in: idCandidates(module.courseId) } }
        : { courseCode: module.courseCode }
    )
    .toArray();
  const index = sortLessons(siblings).findIndex((lesson) => asId(lesson._id) === asId(module._id));
  return index + 1;
}

/**
 * PUT /api/admin/modules/:moduleId/badge
 * Body: { title, description, icon?, active }
 * Creates the lesson's badge, or edits the one it has.
 */
export async function saveModuleBadge(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const module = await findModule(request.params.moduleId);
  if (!module) return response.status(404).json({ message: "Module not found." });

  const body = request.body ?? {};
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!title) return response.status(400).json({ message: "Give the badge a name." });
  if (title.length > 120) {
    return response.status(400).json({ message: "Keep the badge name under 120 characters." });
  }
  if (description.length > 500) {
    return response.status(400).json({ message: "Keep the description under 500 characters." });
  }

  const existing = await collection(BADGES_COLLECTION).findOne({
    moduleId: { $in: idCandidates(module._id) }
  });

  // A new picture is optional on an edit, but a badge must have one.
  let icon = existing?.icon ?? null;
  if (body.icon) {
    const read = readBadgeIcon(body.icon);
    if (read.error) return response.status(400).json({ message: read.error });
    icon = read.icon;
  }
  if (!icon) return response.status(400).json({ message: "Add a picture for the badge." });

  const course = module.courseId
    ? await collection(COURSES_COLLECTION).findOne({ _id: { $in: idCandidates(module.courseId) } })
    : null;
  const lessonTitle = module.title ?? module.fileName ?? "";
  const now = new Date();

  const fields = {
    title,
    description,
    icon,
    iconType: icon.startsWith("data:image/svg") ? "svg" : "image",
    active: body.active === true,
    lessonTitle,
    earnedBy: "quiz-pass",
    order: await lessonOrder(module),
    courseId: module.courseId ?? course?._id ?? null,
    courseCode: courseCode(course) || module.courseCode || "",
    updatedAt: now
  };

  if (existing) {
    await collection(BADGES_COLLECTION).updateOne({ _id: existing._id }, { $set: fields });
    return response.json({ badge: publicBadge({ ...existing, ...fields }) });
  }

  const document = { ...fields, moduleId: module._id, createdAt: now };
  const { insertedId } = await collection(BADGES_COLLECTION).insertOne(document);
  return response.status(201).json({ badge: publicBadge({ ...document, _id: insertedId }) });
}

/**
 * DELETE /api/admin/modules/:moduleId/badge
 * Students' quiz results stay, so adding the badge back gives it back to them.
 */
export async function deleteModuleBadge(request, response) {
  if (!databaseReady()) return serviceUnavailable(response);

  const module = await findModule(request.params.moduleId);
  if (!module) return response.status(404).json({ message: "Module not found." });

  const { deletedCount } = await collection(BADGES_COLLECTION).deleteMany({
    moduleId: { $in: idCandidates(module._id) }
  });
  if (!deletedCount) return response.status(404).json({ message: "This lesson has no badge." });

  return response.json({ removed: true });
}
