import crypto from "crypto";
import mongoose from "mongoose";
import { collectionExists, idCandidates } from "../../lib/mongo.js";
import { removeModuleFigures } from "./figureStore.js";
import { TEXT_FORMAT_VERSION, prepareModuleText } from "./prepareModuleText.js";

/**
 * Extraction jobs: preparing lesson text in the background.
 *
 * Each lesson has one ModuleText document, and its `status` says where its
 * preparation is:
 *
 *   queued     — waiting its turn
 *   extracting — being prepared right now
 *   ready      — done; the reader serves it straight from here
 *   failed     — could not be prepared (`error.message` says why)
 *
 * A status is only about one PDF at one formatter version, so the document
 * also carries `fileId` and `formatVersion`. A lesson whose PDF changed, or
 * that was prepared by an older formatter, counts as not prepared at all.
 *
 * Rules this file keeps:
 * - One job runs at a time, so a large scanned PDF can't overload the server.
 * - A lesson is never queued twice, and a job is never run twice: starting a
 *   job "claims" it by moving queued → extracting in one database write.
 * - The status lives in the database, so after a restart
 *   `resumeExtractionJobs()` picks the unfinished jobs up again.
 * - A lesson that is ready or failed for the same PDF and formatter is never
 *   extracted again.
 */
const MODULES_COLLECTION = "LearningModule";
const MODULE_TEXT_COLLECTION = "ModuleText";

const texts = () => mongoose.connection.collection(MODULE_TEXT_COLLECTION);
const modules = () => mongoose.connection.collection(MODULES_COLLECTION);

/* ── Reading the status ─────────────────────────────────────────────── */

/** True when this record was made from this module's current PDF and formatter. */
function isForCurrentFile(record, module) {
  return (
    Boolean(record) &&
    record.fileId === String(module.fileId ?? "") &&
    record.formatVersion === TEXT_FORMAT_VERSION
  );
}

/**
 * Where this lesson's preparation is: { status, record }.
 *
 * `status` is "queued", "extracting", "ready" or "failed", or "missing" when
 * nothing has been prepared (or queued) for its current PDF yet.
 */
export async function readModuleText(module) {
  const record = await texts().findOne({ moduleId: String(module._id) });
  if (!isForCurrentFile(record, module)) return { status: "missing", record: null };

  // Lessons prepared before job states existed have no status. They were
  // only ever saved once finished, so they are ready.
  return { status: record.status ?? "ready", record };
}

/* ── The queue ──────────────────────────────────────────────────────── */

// Lesson ids waiting their turn, oldest first, and the one running now.
const waiting = [];
let running = null;
// Lessons a queueModuleExtraction() call is busy writing "queued" for, so two
// requests arriving at once can't both start it.
const starting = new Set();
// Callers of whenExtractionIdle(), told when the queue runs dry.
let idleWaiters = [];

function addToQueue(moduleId) {
  // No duplicate jobs for the same lesson.
  if (running === moduleId || waiting.includes(moduleId)) return;
  waiting.push(moduleId);
  // setImmediate starts the work after the current request has sent its
  // response, so nobody waits on it.
  setImmediate(runNextJob);
}

async function runNextJob() {
  if (running) return;

  if (waiting.length === 0) {
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters = [];
    return;
  }

  running = waiting.shift();
  try {
    await runJob(running);
  } catch (error) {
    console.error(`Extraction job for module ${running} stopped:`, error.message);
  } finally {
    running = null;
    setImmediate(runNextJob);
  }
}

async function runJob(moduleId) {
  const module = await modules().findOne({ _id: { $in: idCandidates(moduleId) } });
  // Deleted while it waited.
  if (!module) return;

  const job = {
    moduleId,
    fileId: String(module.fileId ?? ""),
    formatVersion: TEXT_FORMAT_VERSION
  };

  // Claim the job: only one run can move it from queued to extracting. The
  // runId marks this run as the owner, so a stale run can't save over it.
  const runId = crypto.randomUUID();
  const claimed = await texts().updateOne(
    { ...job, status: "queued" },
    { $set: { status: "extracting", startedAt: new Date(), runId } }
  );
  if (claimed.matchedCount === 0) return;

  let finished;
  try {
    const content = await prepareModuleText(module);
    finished = { ...content, status: "ready", error: null };
  } catch (error) {
    console.error(`Preparing module ${moduleId} failed:`, error.message);
    finished = { status: "failed", error: { message: error.message }, failedAt: new Date() };
  }

  const saved = await texts().updateOne({ ...job, runId }, { $set: finished });

  // Nothing was saved because the lesson was deleted mid-job: drop the
  // figures this run stored, or nothing would ever clean them up.
  if (saved.matchedCount === 0) {
    const stillThere = await modules().findOne({ _id: module._id });
    if (!stillThere) await removeModuleFigures(moduleId);
  }
}

/* ── Starting jobs ──────────────────────────────────────────────────── */

/**
 * Makes sure this lesson is prepared, or on its way. Returns its status.
 *
 * Only the "queued" state is written here (one quick database write); the
 * extraction itself runs later, in the background.
 */
export async function queueModuleExtraction(module) {
  const moduleId = String(module._id);

  // Checked before any database call, so two requests at once can't both
  // get past it.
  if (running === moduleId) return "extracting";
  if (waiting.includes(moduleId) || starting.has(moduleId)) return "queued";
  starting.add(moduleId);

  try {
    const { status } = await readModuleText(module);

    // Already ready, failed, or on its way for this same PDF: nothing new to start.
    if (status !== "missing") {
      // A queued job this server isn't holding yet (e.g. after a restart).
      if (status === "queued") addToQueue(moduleId);
      return status;
    }

    await texts().updateOne(
      { moduleId },
      {
        $set: {
          moduleId,
          title: module.title ?? "",
          fileId: String(module.fileId ?? ""),
          formatVersion: TEXT_FORMAT_VERSION,
          status: "queued",
          queuedAt: new Date(),
          startedAt: null,
          runId: null,
          error: null
        }
      },
      { upsert: true }
    );

    addToQueue(moduleId);
    return "queued";
  } finally {
    starting.delete(moduleId);
  }
}

/**
 * Called once when the server starts. A job that was running when the server
 * stopped starts over from the beginning, and queued jobs run in the order
 * they were queued. Returns how many jobs were picked up.
 */
export async function resumeExtractionJobs() {
  if (!(await collectionExists(MODULE_TEXT_COLLECTION))) return 0;

  await texts().updateMany(
    { status: "extracting" },
    { $set: { status: "queued", startedAt: null, runId: null } }
  );

  const unfinished = await texts().find({ status: "queued" }).sort({ queuedAt: 1 }).toArray();
  unfinished.forEach((record) => addToQueue(String(record.moduleId)));
  return unfinished.length;
}

/** Resolves once no job is waiting or running. For tests and scripts. */
export function whenExtractionIdle() {
  if (!running && waiting.length === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}
