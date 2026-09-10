import mongoose from "mongoose";
import { collectionExists } from "./mongo.js";

/**
 * The indexes the read paths depend on.
 *
 * Every collection here was reachable only through a full scan: the app filters
 * them by studentId, courseId, moduleId and assessmentId, and none of those
 * fields carried an index. That costs nothing while a course has six students
 * and one submission, and it is the whole cost once it does not — a student's
 * dashboard reads ModuleProgress and StudentResult on every load, and both grow
 * with (students × lessons) and (students × attempts) respectively.
 *
 * Two shapes are declared unique because the constraint is real, not because
 * the read needs it: a student completes a lesson once, and a lesson has one
 * extracted text. Where duplicates are already stored the unique build fails,
 * and rather than leave the collection unindexed the same key is rebuilt
 * without the constraint — the scan is the problem being solved here, and the
 * duplicates are a separate job.
 *
 * Nothing in this file may stop the server coming up. An index that cannot be
 * built is reported and stepped over; the query still runs, just slowly.
 */

const collection = (name) => mongoose.connection.collection(name);

/**
 * One index per entry. `unique` is an intention, not a promise — see above.
 *
 * The compound keys are ordered so the leading field is the one that is also
 * queried alone: { studentId, courseId } serves a filter on studentId by
 * itself, so no second index is needed for it.
 */
const INDEXES = [
  // Read on every lesson list and every progress bar; written on every
  // completion. The unique key is also the upsert key in modules.controller.
  ["ModuleProgress", { studentId: 1, moduleId: 1 }, { unique: true }],
  ["ModuleProgress", { studentId: 1, courseId: 1 }],
  ["ModuleProgress", { courseId: 1 }],
  // Purging a lesson deletes its completions by moduleId alone, which none of
  // the student-leading keys above can serve.
  ["ModuleProgress", { moduleId: 1 }],

  // The assessor console reads these by course, the student app by student,
  // the skill gap by assessment, and the release path by paper.
  ["StudentResult", { studentId: 1, courseId: 1 }],
  ["StudentResult", { studentId: 1, assessmentId: 1 }],
  ["StudentResult", { courseId: 1 }],
  ["StudentResult", { assessmentId: 1 }],

  // Papers somebody has open. Read by assessment for the generate screen,
  // and written per student per paper — which is also the shape that must
  // not duplicate, since a second row for the same pair would count one
  // student twice.
  ["AssessmentAttempt", { studentId: 1, assessmentId: 1 }, { unique: true }],
  ["AssessmentAttempt", { assessmentId: 1 }],

  // A course's lessons, fetched on nearly every screen either end.
  ["LearningModule", { courseId: 1 }],
  ["LearningModule", { courseCode: 1 }],

  // One extracted text per lesson, looked up by module when a lesson is opened
  // and when a paper is generated.
  ["ModuleText", { moduleId: 1 }, { unique: true }],

  // Class is the access check: it decides whether a student may open a course
  // at all, so it is read before almost every other query in the request.
  ["Class", { studentIds: 1, courseId: 1 }],
  ["Class", { assessorIds: 1, courseId: 1 }],

  // Small, but looked up by code from the module importer and the seeders.
  ["Course", { courseCode: 1 }],
  // `code` is a legacy spelling of courseCode that no document in this database
  // carries, but three lookups still offer it as an $or branch — including the
  // uniqueness check that guards course creation. An $or is only served when
  // every branch is, so without this the whole thing scans. Sparse, because
  // there is nothing to index.
  ["Course", { code: 1 }, { sparse: true }]
];

const label = (key) => Object.keys(key).join("_");

async function build(name, key, { unique = false, sparse = false } = {}) {
  const options = { ...(unique ? { unique: true } : {}), ...(sparse ? { sparse: true } : {}) };

  try {
    await collection(name).createIndex(key, options);
    return { name, key: label(key), state: unique ? "created-unique" : "created" };
  } catch (error) {
    if (!unique) return { name, key: label(key), state: "failed", reason: error.message };

    // Duplicates already stored. The index is still worth having for reads, so
    // it goes in without the constraint and the duplicates stay somebody's
    // problem for another day.
    try {
      await collection(name).createIndex(key, sparse ? { sparse: true } : {});
      return { name, key: label(key), state: "created-non-unique", reason: "duplicates present" };
    } catch (retryError) {
      return { name, key: label(key), state: "failed", reason: retryError.message };
    }
  }
}

/**
 * Build every index above, skipping collections that do not exist yet.
 *
 * Safe to call repeatedly: createIndex on an index that already exists with
 * the same key and options is a no-op, which is what makes this callable at
 * boot rather than run once by hand and forgotten on the next machine.
 */
export async function ensureCoreIndexes() {
  if (mongoose.connection.readyState !== 1) {
    return { ran: false, reason: "database-not-connected", results: [] };
  }

  const present = new Set();
  for (const [name] of INDEXES) {
    if (present.has(name)) continue;
    if (await collectionExists(name)) present.add(name);
  }

  const results = [];
  for (const [name, key, options] of INDEXES) {
    if (!present.has(name)) {
      results.push({ name, key: label(key), state: "skipped", reason: "no-collection" });
      continue;
    }
    results.push(await build(name, key, options));
  }

  return { ran: true, results };
}

/** One line for the boot log: what was built, and what could not be. */
export function summarise({ ran, reason, results }) {
  if (!ran) return `Indexes: skipped (${reason}).`;

  const counts = results.reduce((tally, row) => {
    tally[row.state] = (tally[row.state] ?? 0) + 1;
    return tally;
  }, {});

  const parts = Object.entries(counts).map(([state, n]) => `${n} ${state}`);
  const notes = results
    .filter((row) => row.state === "failed" || row.state === "created-non-unique")
    .map((row) => `${row.name}.${row.key} — ${row.reason}`);

  return [`Indexes: ${parts.join(", ")}.`, ...notes].join("\n  ");
}

export const CORE_INDEXES = INDEXES;
