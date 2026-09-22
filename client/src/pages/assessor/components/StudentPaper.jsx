import { Chip, ChoiceLetter } from "./ui";
import CodeBlock from "../../../components/CodeBlock";

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
 * Every question on the paper, sorted into what became of it.
 *
 * The three add up to the paper, always: a question was earned, missed, or
 * never reached. That is what lets the head draw the attempt as one length
 * instead of listing three figures that the reader has to add up themselves.
 *
 * Counted over the questions still on the paper, which is what `correct` and
 * `answered` are counted over too — a regenerated paper says so underneath
 * rather than quietly drawing a length it cannot account for.
 */
function tallyFor(assessment, result) {
  const itemCount = Number(assessment?.itemCount);
  if (!Number.isFinite(itemCount) || itemCount <= 0) return null;

  const answered = Math.max(0, Math.min(itemCount, Number(result?.answered) || 0));
  const correct = Math.max(0, Math.min(answered, Number(result?.correct) || 0));

  return { itemCount, correct, wrong: answered - correct, blank: itemCount - answered };
}

/**
 * Where the pass mark falls along the paper, as a percentage of its length.
 *
 * A paper's points are its questions times a per-item figure that does not
 * vary (assessments.controller sets totalPoints from items × pointsPerItem),
 * so a fraction of the points is the same length as a fraction of the
 * questions and the line can be drawn across the run of questions beneath it.
 *
 * No pass mark on record, no line: one drawn at nought would say the paper
 * could not be failed.
 */
function passAt(result) {
  const total = Number(result?.totalPoints);
  const passMark = Number(result?.passMark);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(passMark) || passMark <= 0) return null;

  return Math.max(0, Math.min(100, (passMark / total) * 100));
}

/** Which way the pass mark's name hangs off its line, so a mark set near
 *  either end of the paper stays clear of the sheet's edge. */
const anchorFor = (at) => (at > 80 ? "end" : at < 20 ? "start" : "mid");

function StudentPaper({ student, assessment, result, items }) {
  const verdict = (item) => VERDICT[item.verdict] ?? VERDICT.incorrect;
  const took = formatDuration(Number(result?.durationMs));
  const limit = formatLimit(Number(result?.timeLimitMinutes));
  const handedIn = formatWhen(result?.submittedAt);
  const tally = tallyFor(assessment, result);
  const pass = passAt(result);

  return (
    <div className="paper">
      <div className={`paper__head${result?.passed ? "" : " is-under"}`}>
        <div className="paper__who">
          <span className="paper__name">{student?.name}</span>
          {student?.sid ? <span className="paper__id">{student.sid}</span> : null}
        </div>

        {/* The mark, where a mark goes: the top corner, across from the name.
            The figure needs no label above it — the word underneath says what
            it did, and the bar says what it is made of. */}
        <div className="paper__score">
          <span className="assessor-sr-only">Score</span>
          <p className="paper__mark">
            {result?.score}
            <span className="paper__mark-total">/{result?.totalPoints}</span>
          </p>
          <p className="paper__verdict">{result?.passed ? "Passed" : "Not passed"}</p>
        </div>

        <div className="paper__facts">
          {/* Drawn, not described: the runs are named and counted underneath,
              so to a screen reader this is the same facts a second time. */}
          {tally ? (
            <div className="paper__bar">
              <div className="paper__bar-track" aria-hidden="true">
                {tally.correct > 0 ? (
                  <div
                    className="paper__seg paper__seg--right"
                    style={{ flexGrow: tally.correct }}
                  />
                ) : null}
                {tally.wrong > 0 ? (
                  <div
                    className="paper__seg paper__seg--wrong"
                    style={{ flexGrow: tally.wrong }}
                  />
                ) : null}
                {tally.blank > 0 ? (
                  <div
                    className="paper__seg paper__seg--blank"
                    style={{ flexGrow: tally.blank }}
                  />
                ) : null}
              </div>

              {pass === null ? null : (
                <div className="paper__pass" data-anchor={anchorFor(pass)} style={{ left: `${pass}%` }}>
                  <span className="paper__pass-line" aria-hidden="true" />
                  <span className="paper__pass-name">{result.passMark} to pass</span>
                </div>
              )}
            </div>
          ) : null}

          {tally ? (
            <ul className="paper__tally">
              <li>
                <span className="paper__swatch paper__swatch--right" aria-hidden="true" />
                <span>
                  <span className="paper__count">{tally.correct}</span> of {tally.itemCount} correct
                </span>
              </li>

              {/* A run that is not on this paper is not in the list either.
                  Blank is not wrong: both score nothing, but one says the
                  student did not know and the other that they ran out of
                  time. */}
              {tally.wrong > 0 ? (
                <li>
                  <span className="paper__swatch paper__swatch--wrong" aria-hidden="true" />
                  <span>
                    <span className="paper__count">{tally.wrong}</span> wrong
                  </span>
                </li>
              ) : null}

              {tally.blank > 0 ? (
                <li>
                  <span className="paper__swatch paper__swatch--blank" aria-hidden="true" />
                  <span>
                    <span className="paper__count">{tally.blank}</span> left blank
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}

          <dl className="paper__when">
            {/* The limit rides with the figure it is read against rather than
                sitting under it as a footnote: a paper that ran to the buzzer
                and one that was handed in early are the same number
                otherwise. */}
            {took ? (
              <div>
                <dt>Time taken</dt>
                <dd>{limit ? `${took} of ${limit}` : took}</dd>
              </div>
            ) : null}

            {/* "Submitted", the word the register uses for the same event —
                the column it is read from on the way in here says Submitted,
                and a paper that renamed it on arrival made the reader check
                they were looking at the same thing. */}
            {handedIn ? (
              <div>
                <dt>Submitted</dt>
                <dd>{`${handedIn.day} at ${handedIn.time}`}</dd>
              </div>
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

            <CodeBlock code={item.code} className="gen-q__code" />

            <ul className="choice-list">
              {item.choices.map((choice, index) => {
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
                    <ChoiceLetter index={index} />
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

            {item.explanation ? (
              <p className="gen-q__why">
                <span className="gen-q__why-label">Why it&apos;s correct</span>
                {item.explanation}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default StudentPaper;
