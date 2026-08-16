import {
  assembleFinalAssessment,
  ensureAssessmentIndexes,
  generateModuleAssessment
} from "./assessments.generate.js";

/**
 * Writing a lesson's quiz the moment a student asks to sit it.
 *
 * Nothing here is scheduled. Finishing a lesson unlocks its quiz, but it does
 * not write it: the questions are produced when the student presses "Take the
 * Quiz", and not before. That distinction is the whole cost control — a lesson
 * read by thirty students who never open the quiz costs nothing, and a lesson
 * read and then set aside costs nothing either. Only a student who actually
 * intends to sit the paper causes one to be written, and only the first such
 * student does: everyone after them gets the quiz that already exists.
 *
 * Three things make that safe to hang off a student's click:
 *
 * It runs once per lesson. Two students pressing the button in the same moment
 * would otherwise pay for the same quiz twice — `inFlight` collapses them into
 * one call in this process, and the unique index on (courseId, moduleId, scope)
 * is the backstop across processes. The second student waits on the first
 * student's call and gets the same paper.
 *
 * It never throws. A failure comes back as a status the caller can show,
 * because the student is standing in front of this and needs to be told
 * something better than a stack trace.
 *
 * It backs off briefly after a failure, so a lesson whose text is unusable
 * cannot be turned into a retry loop by someone clicking repeatedly.
 */

// Generation is the only thing here that costs money, so it has an off switch
// that does not require a code change. Unset means on: the feature is the
// design, not an experiment.
const DISABLED = String(process.env.AUTO_GENERATE_ASSESSMENTS ?? "").toLowerCase() === "false";

/**
 * How long to leave a failed lesson alone.
 *
 * Short, because this is now a deliberate act by a person who is waiting: a
 * student who presses the button again a minute later is retrying on purpose,
 * not hammering. It exists only to stop a rapid series of clicks from becoming
 * a series of paid calls.
 */
const RETRY_AFTER_MS = 60 * 1000;

const inFlight = new Map();
const failures = new Map();

let indexesReady = null;

const key = (value) => String(value ?? "");

/** Whether writing quizzes on demand is switched on at all. */
export function autoGenerationEnabled() {
  return !DISABLED;
}

/** Whether a call for this lesson is in flight right now. */
export function isPreparing(moduleId) {
  return inFlight.has(key(moduleId));
}

function recordFailure(id, reason) {
  failures.set(id, { at: Date.now(), reason });
}

/**
 * Writes this lesson's quiz and resolves when it exists.
 *
 * Awaited, unlike everything else that touches the model: the student pressed a
 * button and is watching a "Generating your quiz" message, so the wait is the
 * point rather than something to hide from.
 */
export function ensureLessonAssessment({ courseId, moduleId }) {
  const id = key(moduleId);

  if (DISABLED) return Promise.resolve({ status: "skipped", reason: "auto-generation-disabled" });
  if (!id || !key(courseId)) {
    return Promise.resolve({ status: "skipped", reason: "missing-ids" });
  }

  // Already running for this lesson — wait on it rather than start a second.
  const running = inFlight.get(id);
  if (running) return running;

  const failure = failures.get(id);
  if (failure && Date.now() - failure.at < RETRY_AFTER_MS) {
    return Promise.resolve({ status: "skipped", reason: "recently-failed", detail: failure.reason });
  }

  const work = (async () => {
    // The unique index is what stops two server processes writing the same
    // quiz. Built once, not per call.
    indexesReady = indexesReady ?? ensureAssessmentIndexes();
    await indexesReady;

    const result = await generateModuleAssessment({ courseId, moduleId });

    // "already-exists" is a success from here: the quiz is there, which is all
    // the student wanted. Only a real failure earns a cooldown.
    if (result.status === "error" || result.status === "rejected") {
      recordFailure(id, result.reason ?? "generation-failed");
    } else {
      failures.delete(id);
    }

    return result;
  })()
    .catch((error) => {
      recordFailure(id, error.message);
      return { status: "error", reason: "generation-threw", message: error.message };
    })
    .finally(() => {
      inFlight.delete(id);
    });

  inFlight.set(id, work);
  return work;
}

/**
 * Assembles the course's final exam once every lesson quiz exists.
 *
 * Free — the final is drawn from the lesson banks and makes no model call — so
 * it is safe to attempt whenever the rail is read, rather than waiting for
 * anyone to ask for it.
 */
export async function ensureFinalAssessment({ courseId }) {
  if (DISABLED) return { status: "skipped", reason: "auto-generation-disabled" };
  if (!key(courseId)) return { status: "skipped", reason: "missing-ids" };

  const id = `final:${key(courseId)}`;
  const running = inFlight.get(id);
  if (running) return running;

  const work = assembleFinalAssessment({ courseId })
    .catch((error) => ({ status: "error", reason: "assembly-threw", message: error.message }))
    .finally(() => inFlight.delete(id));

  inFlight.set(id, work);
  return work;
}

/** Test seam — clears the in-process memory of what is running and what failed. */
export function resetAutoGenerationState() {
  inFlight.clear();
  failures.clear();
  indexesReady = null;
}
