/**
 * Where a generation run has got to.
 *
 * Writing a final exam is one model call per lesson — thirteen of them on CC2,
 * four at a time — and the screen had no way to know which one it was on, so it
 * showed a skeleton for the whole minute and a half. The generator reports each
 * lesson as it lands, this holds the count, and the Generate screen reads it
 * back while it waits.
 *
 * Held in memory on purpose. A run is worth nothing once it ends, the app runs
 * as one instance, and a count that outlived a restart would be a count of
 * nothing. Finished runs are kept ten minutes so the last poll still finds the
 * ending, then swept.
 */

const runs = new Map();
const KEEP_MS = 10 * 60 * 1000;

/** The stages a run passes through when it is not writing a lesson. */
export const STAGES = ["reading", "writing", "checking", "saving", "done"];

/**
 * One run per paper: which course, which class, and which of their papers.
 *
 * The class is part of it because two classes on one course are written
 * separately, and a count from the other one would be the wrong count.
 */
export function runKey({ courseId, classId = null, scope = "final", moduleId = null }) {
  return [courseId, classId ?? "-", scope, moduleId ?? "-"].map(String).join(":");
}

function sweep() {
  const now = Date.now();
  for (const [key, run] of runs) {
    if (run.finishedAt && now - run.finishedAt > KEEP_MS) runs.delete(key);
  }
}

export function startRun(key, { stage = "reading", total = 0 } = {}) {
  sweep();
  runs.set(key, {
    stage,
    // How many lessons the paper is written from. Zero until the plan is read,
    // because until then nobody knows — not even the generator.
    total,
    done: 0,
    // Lessons finished, in the order they landed, and the ones in flight now.
    written: [],
    writing: [],
    startedAt: Date.now(),
    finishedAt: null
  });
  return runs.get(key);
}

/** What the run is doing now. `total` arrives with the writing stage. */
export function setStage(key, stage, total = null) {
  const run = runs.get(key);
  if (!run) return null;
  run.stage = stage;
  if (Number.isInteger(total) && total > 0) run.total = total;
  return run;
}

export function lessonStarted(key, topic) {
  const run = runs.get(key);
  if (!run || !topic) return null;
  if (!run.writing.includes(topic)) run.writing.push(topic);
  return run;
}

/**
 * One lesson written, however it went.
 *
 * A lesson the model came up short on still took its call and still moves the
 * count: the bar is how far through the work the run is, not how much of the
 * paper turned out usable. What came back short is named beside the paper
 * afterwards, which is where the assessor can do something about it.
 */
export function lessonDone(key, topic) {
  const run = runs.get(key);
  if (!run) return null;
  run.writing = run.writing.filter((name) => name !== topic);
  if (topic) run.written.push(topic);
  run.done += 1;
  return run;
}

export function endRun(key) {
  const run = runs.get(key);
  if (!run) return null;
  run.stage = "done";
  run.writing = [];
  run.finishedAt = Date.now();
  return run;
}

/** The run as the screen reads it, or null when there is nothing to report. */
export function readRun(key) {
  const run = runs.get(key);
  if (!run) return null;
  return {
    stage: run.stage,
    total: run.total,
    done: run.done,
    written: [...run.written],
    writing: [...run.writing],
    startedAt: run.startedAt,
    finishedAt: run.finishedAt
  };
}

/** For tests, and for a restart that wants to begin from nothing. */
export function clearRuns() {
  runs.clear();
}
