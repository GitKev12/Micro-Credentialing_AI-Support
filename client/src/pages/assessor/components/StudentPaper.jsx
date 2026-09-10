import { Chip } from "./ui";

/**
 * One student's handed-in paper, as the assessor reads it.
 *
 * The register says a student scored 3 of 10; this says which 3. Every
 * question as it was written, the answer it was marked against, and what the
 * student put down beside it.
 *
 * The student's own review of the same paper deliberately withholds the key —
 * a wrong answer there says "not this", never "that one", so that reopening a
 * marked quiz is not a way to read off the answers. This is the other side of
 * that: the person reading here wrote the paper. Seeing the key is the point,
 * because the question they are really asking of a badly-answered item is
 * whether the class missed it or the question is wrong.
 *
 * Nothing here changes anything. The mark was made against the key at hand-in
 * and stands; there is no control on this screen and no route behind it that
 * would let one be re-marked.
 */

const VERDICT = {
  correct: { label: "Correct", tone: "success" },
  incorrect: { label: "Incorrect", tone: "danger" }
};

/** The day, with the time under it rather than trailing after a comma. */
function formatWhen(iso) {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;

  return {
    day: when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  };
}

/**
 * A length of time on the clock: m:ss, and h:mm:ss once it runs past an hour.
 *
 * It used to round to whole minutes and say "5m", which threw away the part of
 * the figure the reader is looking for. Time taken is read against the time
 * allowed — whether a paper was finished comfortably or ran to the buzzer, and
 * whether two students who both "took 30m" took 29:40 and 30:00. Rounded to
 * the minute those are the same number, and they are not the same paper.
 */
function formatClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;

  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** How long the attempt ran. Anything recorded reads as at least 0:01: a flat
 *  nought would say the length was never timed, which is a different thing. */
const formatDuration = (ms) =>
  Number.isFinite(ms) && ms > 0 ? formatClock(Math.max(1, ms / 1000)) : null;

/** The time allowed, which is set in whole minutes and shown on the same clock
 *  as the time taken — one is read against the other. */
const formatLimit = (minutes) =>
  Number.isFinite(minutes) && minutes > 0 ? formatClock(minutes * 60) : null;

/**
 * Where the mark stands, as a fraction of the paper and of the pass mark.
 *
 * The pass mark used to be a footnote under the score — "Pass mark 6" — which
 * left the reader to work out that 3 was under 6 out of 10. It is a threshold,
 * and this console already draws thresholds as lines: the skill-gap chart puts
 * a column against a pass line, and a column standing under it is the thing an
 * assessor is looking for. Same idea at the size of one paper.
 */
function meterFor(result) {
  const total = Number(result?.totalPoints);
  if (!Number.isFinite(total) || total <= 0) return null;

  const within = (value) => Math.max(0, Math.min(100, (value / total) * 100));
  const passMark = Number(result?.passMark);

  return {
    fill: within(Number(result?.score) || 0),
    // No pass mark on record, no tick: a line drawn at nought would say the
    // paper could not be failed.
    tick: Number.isFinite(passMark) && passMark > 0 ? within(passMark) : null
  };
}

function StudentPaper({ student, assessment, result, items }) {
  const verdict = (item) => VERDICT[item.verdict] ?? VERDICT.incorrect;
  const took = formatDuration(Number(result?.durationMs));
  const limit = formatLimit(Number(result?.timeLimitMinutes));
  const handedIn = formatWhen(result?.submittedAt);
  const meter = meterFor(result);
  const blank = Math.max(0, (assessment?.itemCount ?? 0) - (result?.answered ?? 0));

  return (
    <div className="paper">
      <div className="paper__head">
        <div className="paper__who">
          <span className="paper__name">{student?.name}</span>
          {student?.sid ? <span className="paper__id">{student.sid}</span> : null}
        </div>

        {/* The mark, and then everything else.

            Five equal columns gave a timestamp the same voice as the mark, and
            each carried its own footnote, so the block was five columns of
            three lines with a ragged bottom — and it re-spaced itself whenever
            a paper had nothing left blank. The mark leads now, measured
            against the pass mark on the meter under it; the rest is a list,
            where a fact that is missing takes a line out rather than moving
            the ones that are left. */}
        <div className="paper__facts">
          <div className={`paper__score${result?.passed ? "" : " is-under"}`}>
            <span className="paper__score-name">Score</span>
            <span className="paper__mark">
              {result?.score}/{result?.totalPoints}
            </span>

            {/* Drawn, not described: the words underneath carry the same two
                facts, so this is decoration to a screen reader. */}
            {meter ? (
              <div className="paper__meter" aria-hidden="true">
                <div className="paper__meter-fill" style={{ width: `${meter.fill}%` }} />
                {meter.tick === null ? null : (
                  <div className="paper__meter-tick" style={{ left: `${meter.tick}%` }} />
                )}
              </div>
            ) : null}

            <div className="paper__verdict">
              <span>{result?.passed ? "Passed" : "Not passed"}</span>
              {meter?.tick === null ? null : <span>{result.passMark} to pass</span>}
            </div>
          </div>

          <dl className="paper__rows">
            <dt>Correct</dt>
            <dd>
              {result?.correct} of {assessment?.itemCount}
            </dd>

            {/* Blank is not wrong. Both score nothing, but one says the student
                did not know and the other that they ran out of time — and a
                paper with none of them should not carry the row at all. */}
            {blank > 0 ? (
              <>
                <dt>Left blank</dt>
                <dd>{blank}</dd>
              </>
            ) : null}

            {/* The limit rides with the figure it is read against rather than
                sitting under it as a footnote: a paper that ran to the buzzer
                and one that was handed in early are the same number otherwise. */}
            {took ? (
              <>
                <dt>Time taken</dt>
                <dd>{limit ? `${took} of ${limit}` : took}</dd>
              </>
            ) : null}

            {/* "Submitted", the word the register uses for the same event — the
                column it is read from on the way in here says Submitted, and a
                paper that renamed it on arrival made the reader check they were
                looking at the same thing. */}
            {handedIn ? (
              <>
                <dt>Submitted</dt>
                <dd>{`${handedIn.day} at ${handedIn.time}`}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {/* Regenerating a paper replaces its questions, and a mark made before
          that was made against questions that are gone. The mark stands — it
          was earned against the paper as served — but this screen can only
          show what is still there, so it says how much it cannot show. */}
      {result?.missing > 0 ? (
        <p className="paper__note">
          {result.missing} question{result.missing === 1 ? "" : "s"} this student answered
          {result.missing === 1 ? " is" : " are"} no longer on this paper. It has been
          regenerated since they took it, and their mark was made against the questions
          they were given.
        </p>
      ) : null}

      <ol className="gen-q-list">
        {items.map((item) => (
          <li className="gen-q" key={item.id}>
            <div className="gen-q__head">
              <span className="gen-q__num">{item.n}</span>
              <p className="gen-q__text">{item.q}</p>
              <Chip tone={verdict(item).tone}>{verdict(item).label}</Chip>
            </div>

            <ul className="choice-list">
              {item.choices.map((choice) => {
                const isKey = choice.id === item.key;
                const isTheirs = choice.id === item.chosen;

                return (
                  <li
                    key={choice.id}
                    className={
                      "choice" +
                      (isKey ? " is-key" : "") +
                      (isTheirs && !isKey ? " is-wrong" : "")
                    }
                  >
                    <span className="choice__id">{choice.id}</span>
                    <span className="choice__text">{choice.text}</span>

                    {isKey || isTheirs ? (
                      <span className="choice__tags">
                        {isKey ? (
                          <span className="choice__tag choice__tag--key">Correct answer</span>
                        ) : null}
                        {isTheirs ? (
                          <span className="choice__tag choice__tag--picked">Their answer</span>
                        ) : null}
                      </span>
                    ) : null}
                  </li>
                );
              })}

              {item.answered ? null : (
                <li className="choice choice--blank">
                  <span className="choice__text">Left blank</span>
                </li>
              )}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default StudentPaper;
