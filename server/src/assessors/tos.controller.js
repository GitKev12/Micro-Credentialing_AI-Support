import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../lib/mongo.js";
import { sortLessons } from "../lib/lessonOrder.js";
import { TOS_LEVELS } from "../assessments/assessments.format.js";
import {
  courseCode,
  courseTitle,
  findAssignedCourse,
  moduleFilterForCourse
} from "./assessors.controller.js";
import { classesTaughtBy, loadClassesByCourse } from "../lib/courseAccess.js";
import { classMode, isAssessOnly } from "../lib/classMode.js";

/**
 * One course's Table of Specification, read and written by its own assessor.
 *
 * These two endpoints replace a pair on /api/admin that took no course scope
 * at all: any admin could read and overwrite every blueprint in the system,
 * and the screen above them was a spreadsheet with no idea which course it was
 * spending. A blueprint is an instruction to the generator, and the person who
 * can give it is the one teaching the course — so it is scoped the way every
 * other authoring route here is, to the assessor's own classes.
 *
 * The document holds two blueprints, because the course writes two kinds of
 * paper:
 *
 *   `rows`  — one per lesson, each stating that lesson's quiz: how many
 *             questions at each level of thinking. Unchanged in shape from
 *             what the admin screen wrote, so every stored blueprint still
 *             reads and every generator still follows it.
 *
 *   `final` — the examination, which draws on every lesson at once and so
 *             needs what a per-lesson row cannot say: how much of the paper
 *             each lesson carries, what the paper as a whole demands, and the
 *             matrix where those two meet.
 */

const TOS_COLLECTION = "TableOfSpecification";
const MODULES_COLLECTION = "LearningModule";

const collection = (name) => mongoose.connection.collection(name);
const asId = (value) => String(value);
const databaseReady = () => mongoose.connection.readyState === 1;

const serviceUnavailable = (response) =>
  response.status(503).json({ message: "Database unavailable." });

const toCount = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Every level present and a whole count on each, whatever arrived. */
const levelsOf = (source) =>
  Object.fromEntries(TOS_LEVELS.map((level) => [level, toCount(source?.[level])]));

/**
 * One row of the per-lesson blueprint.
 *
 * `moduleId` is the row's real identity — `course` is a coverage label anyone
 * may retype — so a row that names no lesson is dropped rather than stored.
 * Generation matches rows to lessons by that id, and a row it cannot match is
 * a row no quiz will ever be written from.
 */
function quizRow(row) {
  if (!row?.moduleId) return null;

  const levels = levelsOf(row);
  return {
    moduleId: String(row.moduleId),
    course: String(row.course ?? "").trim(),
    ...levels,
    items: TOS_LEVELS.reduce((sum, level) => sum + levels[level], 0)
  };
}

/**
 * One row of the final's matrix.
 *
 * `target` is what the assessor said this lesson's share of the examination
 * should be, kept beside what the cells actually add up to rather than derived
 * from them. They are two different facts: the share is the plan, the cells
 * are the distribution, and a blueprint saved while they disagree has to come
 * back still disagreeing or the screen would silently lose the discrepancy it
 * was showing.
 */
function finalRow(row) {
  if (!row?.moduleId) return null;

  const levels = levelsOf(row);
  return {
    moduleId: String(row.moduleId),
    coverage: String(row.coverage ?? "").trim(),
    target: toCount(row.target),
    ...levels,
    items: TOS_LEVELS.reduce((sum, level) => sum + levels[level], 0)
  };
}

function finalBlock(source) {
  if (!source) return null;

  const rows = (Array.isArray(source.rows) ? source.rows : []).map(finalRow).filter(Boolean);

  return {
    items: toCount(source.items),
    levels: levelsOf(source.levels),
    rows
  };
}

/** What the screen is handed: the blueprint, without its Mongo internals. */
function publicTos(doc) {
  if (!doc) return null;

  return {
    courseId: doc.courseId ? String(doc.courseId) : null,
    classId: doc.classId ? String(doc.classId) : null,
    examination: doc.examination ?? "",
    rows: Array.isArray(doc.rows) ? doc.rows.map(quizRow).filter(Boolean) : [],
    final: doc.final ? finalBlock(doc.final) : null,
    updatedAt: doc.updatedAt ?? null
  };
}

/** The lessons a blueprint is written against, in the order the course runs. */
async function lessonsOf(course) {
  if (!(await collectionExists(MODULES_COLLECTION))) return [];

  const modules = await collection(MODULES_COLLECTION)
    .find(moduleFilterForCourse(course))
    .toArray();

  return sortLessons(modules).map((lesson, index) => ({
    id: asId(lesson._id),
    title: lesson.title ?? lesson.name ?? `Lesson ${index + 1}`
  }));
}

/**
 * The course, and which of its classes this blueprint belongs to.
 *
 * A taught class writes the course's own blueprint — one document, no classId,
 * which is every blueprint written before this existed. An assess-only class
 * writes its own, because it is examined on a different paper: the same lessons
 * covered, a different length, and no per-lesson quiz rows to fill in at all.
 *
 * So `classId` here is not "which class asked" — it is "whose document is
 * this", and it is null for every taught class however many classes the course
 * has. Two taught sections share a blueprint exactly as they did.
 */
async function scopeOf(request, response) {
  if (!databaseReady()) {
    serviceUnavailable(response);
    return null;
  }

  const assessor = request.assessor;
  const course = await findAssignedCourse(assessor, request.params.courseId);
  if (!course) {
    response.status(404).json({ message: "Course not found for this assessor." });
    return null;
  }

  const classes = classesTaughtBy(
    (await loadClassesByCourse([course])).get(asId(course._id)) ?? [],
    assessor._id
  );

  const asked = request.query?.classId ?? request.body?.classId ?? null;
  const chosen = asked ? classes.find((cls) => asId(cls._id) === String(asked)) : null;

  if (asked && !chosen) {
    response.status(404).json({ message: "Class not found for this assessor on this course." });
    return null;
  }

  const held = chosen ?? classes[0] ?? null;
  const assessOnly = isAssessOnly(held);

  return {
    course,
    classes,
    assessOnly,
    classId: held ? asId(held._id) : null,
    // Whose document. Only an assess-only class owns one of its own.
    ownerId: assessOnly && held ? asId(held._id) : null
  };
}

/** The filter that finds one scope's blueprint, and only that one. */
const tosFilter = (course, ownerId) => ({
  courseId: { $in: idCandidates(course._id) },
  // `$in: [null]` matches a stored null and an absent field alike, so the
  // course's own blueprint still reads after assess-only ones exist beside it.
  classId: ownerId ? { $in: idCandidates(ownerId) } : { $in: [null] }
});

/**
 * The blueprint, its lessons, and the course it belongs to.
 *
 * The lessons travel with it because a stored row names only a moduleId, and
 * nothing on the screen can be read until there is a title beside each one. A
 * course with no blueprint yet answers with `tos: null` rather than a 404 —
 * not having written one is a state of the screen, not a missing page.
 */
export async function getCourseTos(request, response) {
  const scope = await scopeOf(request, response);
  if (!scope) return undefined;

  const { course, ownerId } = scope;

  const doc = (await collectionExists(TOS_COLLECTION))
    ? await collection(TOS_COLLECTION).findOne(tosFilter(course, ownerId))
    : null;

  return response.json({
    course: {
      id: asId(course._id),
      code: courseCode(course),
      title: courseTitle(course),
      section: course.section ?? null
    },
    classes: scope.classes.map((cls) => ({
      id: asId(cls._id),
      name: cls.name ?? "Unnamed class",
      mode: classMode(cls)
    })),
    classId: scope.classId,
    assessOnly: scope.assessOnly,
    lessons: await lessonsOf(course),
    tos: publicTos(doc)
  });
}

/**
 * Write the course's blueprint.
 *
 * Keyed on courseId and upserted, so an assessor saving twice edits one
 * document rather than accumulating them — the failure the admin endpoints had
 * before they were scoped, where a save landed on whichever blueprint happened
 * to sort first.
 *
 * Rows are stored as sent rather than merged into what is there. The screen
 * always sends every lesson, so a merge would only be able to resurrect rows
 * for lessons the course no longer has.
 */
export async function saveCourseTos(request, response) {
  const scope = await scopeOf(request, response);
  if (!scope) return undefined;

  const { course, ownerId, assessOnly } = scope;

  const { rows, final, examination } = request.body ?? {};
  if (!Array.isArray(rows)) {
    return response.status(400).json({ message: "rows must be an array." });
  }

  const courseId = asId(course._id);
  const payload = {
    courseCode: courseCode(course),
    examination: String(examination ?? courseTitle(course) ?? "").trim(),
    // An assess-only class writes no lesson quizzes, so its document carries no
    // rows for them. Storing an empty list rather than refusing one that
    // arrived keeps the screen free to send whatever it has.
    rows: assessOnly ? [] : rows.map(quizRow).filter(Boolean),
    final: finalBlock(final),
    updatedAt: new Date()
  };

  // Found then written, rather than upserted. The filter matches `classId` with
  // `$in`, and an upsert builds its new document partly out of the filter — so
  // Mongo would be setting the same path twice and refuse the whole write.
  const tos = collection(TOS_COLLECTION);
  const existing = await tos.findOne(tosFilter(course, ownerId));

  if (existing) {
    await tos.updateOne({ _id: existing._id }, { $set: payload });
  } else {
    await tos.insertOne({ ...payload, courseId, classId: ownerId, createdAt: new Date() });
  }

  const doc = await tos.findOne(tosFilter(course, ownerId));

  return response.json({ tos: publicTos(doc) });
}
