import { useState } from "react";

import { submitPreAssessment } from "../../../services/preAssessments";

/**
 * A lesson's Pre-Assessment, shown after the lesson's last section: all
 * questions together, answered once. Not graded. After submitting, the
 * student sees what they got right.
 */
function PreAssessmentRunner({ studentId, preAssessment, onSubmitted }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const attempt = preAssessment.attempt;
  // After submitting, the attempt carries the questions with their answers.
  const items = attempt ? attempt.items : preAssessment.items;
  const given = attempt ? attempt.answers : answers;
  const allAnswered = items.every((item) => answers[item.id] !== undefined);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await submitPreAssessment(studentId, preAssessment.id, answers);
      onSubmitted(preAssessment.id, result);
    } catch (failure) {
      // Already taken elsewhere: the server sends that attempt back.
      const existing = failure?.response?.data?.attempt;
      if (existing) onSubmitted(preAssessment.id, existing);
      else setError(failure?.response?.data?.message ?? "Couldn't send your answers. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sd-quiz sd-pre">
      {attempt ? (
        <div className="sd-quiz__result sd-pre__result">
          <p className="sd-quiz__score">
            {attempt.score} of {attempt.total} correct
          </p>
        </div>
      ) : null}

      {items.map((item, index) => (
        <div className="sd-quiz__item" key={item.id}>
          <div className="sd-quiz__qhead">
            <span className="sd-quiz__qcount">
              Question {index + 1} of {items.length}
            </span>
            <span className="sd-quiz__type">
              {item.type === "true-false" ? "True or false" : "Multiple choice"}
            </span>
          </div>

          <p className="sd-quiz__q">{item.q}</p>

          <div className="sd-quiz__choices" role="radiogroup" aria-label={item.q}>
            {item.choices.map((choice) => {
              const picked = given[item.id] === choice.id;
              // Once taken, the right answer is shown, and a wrong pick is marked.
              const verdict = attempt
                ? choice.id === item.key
                  ? " is-correct"
                  : picked
                    ? " is-wrong"
                    : ""
                : "";
              return (
                <label className={`sd-quiz__choice${picked ? " is-picked" : ""}${verdict}`} key={choice.id}>
                  <input
                    type="radio"
                    name={`pre-${item.id}`}
                    value={choice.id}
                    checked={picked}
                    disabled={Boolean(attempt) || busy}
                    onChange={() => setAnswers((all) => ({ ...all, [item.id]: choice.id }))}
                  />
                  <span className="sd-quiz__choice-text">{choice.text}</span>
                </label>
              );
            })}
          </div>

          {attempt && item.explanation ? <p className="sd-pre__explain">{item.explanation}</p> : null}
        </div>
      ))}

      {error ? <p className="sd-quiz__error">{error}</p> : null}

      {attempt ? null : (
        <div className="sd-quiz__nav">
          <span className="sd-quiz__progress">
            {Object.keys(answers).length} of {items.length} answered
          </span>
          <button
            type="button"
            className="module-row__action"
            disabled={busy || !allAnswered}
            onClick={submit}
          >
            {busy ? "Sending…" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

export default PreAssessmentRunner;
