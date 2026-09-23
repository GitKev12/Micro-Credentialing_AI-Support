import { ClockIcon, QuizIcon } from "./icons";
import { durationLabel } from "../assessmentClock";

/**
 * The paper, face down.
 *
 * Nothing here is fetched. Every figure on this screen — how many questions,
 * the pass mark, the length, which attempt this is — already travelled with
 * the rail row, and that is the whole point: asking the server for the paper
 * is what registers the sitting as begun and starts the clock (see
 * openAttempt). A brief that loaded the questions in order to describe them
 * would have started the examination to ask whether the candidate was ready.
 *
 * So this is the closed paper rather than a dialog over an open one. It stands
 * where the questions will stand, and pressing Start turns it over.
 *
 * What it says is what an invigilator says before a paper is handed out: how
 * long, how many, what passes, and what happens when the time is gone. The
 * length is the only figure set large, because it is the one that changes how
 * the candidate works. An untimed quiz has no such block at all — an absence
 * does not need a label reading "Untimed".
 */
function AssessmentBrief({ assessment, result, starting, error, onStart }) {
  const isFinal = assessment?.scope === "final";
  const paper = isFinal ? "final exam" : "quiz";

  const minutes = Number(assessment?.timeLimitMinutes) || 0;
  const timed = minutes > 0;

  const attemptsLeft = result?.attemptsLeft ?? null;
  const attemptsAllowed = result?.attemptsAllowed ?? null;
  // Which sitting this is about to be, counted from what has already gone.
  // A paper just handed in reports the attempt it was rather than a tally, so
  // that number is the tally — the same reading StudentPage takes of it.
  const nextAttempt = (result?.attemptsUsed ?? result?.attempt ?? 0) + 1;
  const retaking = nextAttempt > 1;

  const start = retaking
    ? `Start attempt ${nextAttempt}${attemptsAllowed ? ` of ${attemptsAllowed}` : ""}`
    : `Start the ${paper}`;

  return (
    <div className="sd-brief">
      <div className="sd-brief__head">
        <h3 className="sd-brief__title">{assessment?.title ?? (isFinal ? "Final exam" : "Quiz")}</h3>
        {assessment?.description ? (
          <p className="sd-brief__desc">{assessment.description}</p>
        ) : null}
      </div>

      {timed ? (
        <div className="sd-brief__clock">
          <span className="sd-brief__clock-icon" aria-hidden="true">
            <ClockIcon size={18} />
          </span>
          <p className="sd-brief__clock-figure">{durationLabel(minutes)}</p>
          <p className="sd-brief__clock-note">
            The clock starts when you press Start and keeps running if you leave
            this page. When it runs out your paper hands itself in.
          </p>
        </div>
      ) : null}

      {/* Terms, so they are marked up as terms. Four related facts about one
          paper are a description list; cut into four cards they would read as
          four unrelated things. */}
      <dl className="sd-brief__terms">
        <div className="sd-brief__term">
          <dt>Questions</dt>
          <dd>{assessment?.itemCount ?? "—"}</dd>
        </div>
        <div className="sd-brief__term">
          <dt>Pass mark</dt>
          <dd>
            {assessment?.passMark ?? "—"} of {assessment?.totalPoints ?? "—"}
          </dd>
        </div>
        {attemptsLeft !== null ? (
          <div className="sd-brief__term">
            <dt>Attempts left</dt>
            <dd>
              {attemptsLeft} of {attemptsAllowed}
            </dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <p className="sd-quiz__error" role="status">
          {error}
        </p>
      ) : null}

      <div className="sd-brief__go">
        <button
          type="button"
          className="sd-brief__start"
          onClick={onStart}
          disabled={starting}
        >
          <QuizIcon size={15} />
          {starting ? "Opening…" : start}
        </button>
        {/* True, and the thing a candidate most wants to know before
            committing: a dropped connection does not cost them the paper. */}
        <p className="sd-brief__saved">Your answers are kept as you go.</p>
      </div>
    </div>
  );
}

export default AssessmentBrief;
