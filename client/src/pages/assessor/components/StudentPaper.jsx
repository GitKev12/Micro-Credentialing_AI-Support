import { Chip, Metric } from "./ui";

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

/** A length of time in the hours and minutes a person would say it in. */
function formatMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** How long the attempt ran. Under a minute still reads as "1m": nought would
 *  say the length was never recorded, which is a different thing. */
const formatDuration = (ms) =>
  Number.isFinite(ms) && ms > 0 ? formatMinutes(Math.max(1, Math.round(ms / 60000))) : null;

function StudentPaper({ student, assessment, result, items }) {
  const verdict = (item) => VERDICT[item.verdict] ?? VERDICT.incorrect;
  const took = formatDuration(Number(result?.durationMs));
  const limit = formatMinutes(Number(result?.timeLimitMinutes));
  const handedIn = formatWhen(result?.submittedAt);
  const blank = Math.max(0, (assessment?.itemCount ?? 0) - (result?.answered ?? 0));

  return (
    <div className="paper">
      <div className="paper__head">
        <div className="paper__who">
          <span className="paper__name">{student?.name}</span>
          {student?.sid ? <span className="paper__id">{student.sid}</span> : null}
        </div>

        {/* Each number under the word for what it is. They were a run of
            unlabelled fragments on one line — "2/5 1 of 5 correct 1 left blank
            Handed in… Took…" — which made the reader parse a sentence to find
            a figure, and made five different kinds of thing look alike. */}
        <div className="paper__facts">
          <Metric
            label="Score"
            value={
              <span className={result?.passed ? "paper__mark" : "paper__mark is-under"}>
                {result?.score}/{result?.totalPoints}
              </span>
            }
            hint={result?.passMark ? `Pass mark ${result.passMark}` : null}
          />

          <Metric label="Correct" value={`${result?.correct} of ${assessment?.itemCount}`} />

          {/* Blank is not wrong. Both score nothing, but one says the student
              did not know and the other that they ran out of time — and a
              paper with none of them should not carry an empty column. */}
          {blank > 0 ? <Metric label="Left blank" value={blank} /> : null}

          {took ? (
            <Metric
              label="Time taken"
              value={took}
              hint={limit ? `of ${limit} allowed` : null}
            />
          ) : null}

          {handedIn ? (
            <Metric label="Handed in" value={handedIn.day} hint={handedIn.time} />
          ) : null}
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
