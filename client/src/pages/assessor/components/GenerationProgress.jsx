/* How each stage of a run reads, when it is not counting lessons. */
const STAGE_TEXT = {
  reading: "Reading the lesson text",
  checking: "Checking the questions",
  saving: "Saving the paper",
  done: "Finishing"
};

/**
 * Where the write has got to.
 *
 * A final is one model call per lesson, so "4 of 13 lessons" is a real count
 * read back from the server and the bar is a real measure of the wait. A quiz
 * is a single call and has no count to give: there the track runs indeterminate
 * rather than inventing a percentage that would sit at 50% for the whole write.
 *
 * It replaced three skeleton question cards, which said the screen was busy and
 * nothing else — on a thirteen-lesson final that was ninety seconds of a shape
 * that never changed.
 */
function GenerationProgress({ progress, scope }) {
  const stage = progress?.stage ?? "reading";
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  // Countable only when the paper takes more than one call.
  const counted = total > 1;
  const pct = counted ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const reading =
    stage === "writing"
      ? counted
        ? `${done} of ${total} lessons`
        : "Writing questions"
      : (STAGE_TEXT[stage] ?? "");

  const writing = progress?.writing ?? [];
  const written = progress?.written ?? [];

  return (
    <div className="gen-progress">
      <p className="gen-progress__title">
        {scope === "final" ? "Writing the final exam" : "Writing the exam"}
      </p>

      <div className="progress__row" role="status">
        <span>{reading}</span>
        {counted ? <span>{pct}%</span> : null}
      </div>

      <div
        className={`progress__track${counted ? "" : " gen-progress__track--waiting"}`}
        role="progressbar"
        aria-label="Generation progress"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(counted ? { "aria-valuenow": pct } : {})}
      >
        {counted ? (
          <div className="progress__fill" style={{ width: `${pct}%` }} />
        ) : (
          <div className="gen-progress__band" />
        )}
      </div>

      {/* Which lessons, not how many — the count above already says how many.
          The names are the part that shows the run is moving. */}
      {writing.length > 0 ? (
        <p className="gen-progress__line">
          <span className="gen-progress__label">Writing now</span>
          {writing.join(" · ")}
        </p>
      ) : null}

      {written.length > 0 ? (
        <p className="gen-progress__line is-quiet">
          <span className="gen-progress__label">Written</span>
          {written.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export default GenerationProgress;
