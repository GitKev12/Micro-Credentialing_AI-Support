import { useEffect, useMemo, useState } from "react";
import {
  fetchAssessment,
  prepareLessonAssessment,
  submitAssessment
} from "../../../services/assessments";
import { CheckIcon, LockIcon, QuizIcon } from "./icons";

/**
 * Taking a quiz.
 *
 * Multiple-choice and true-false both arrive as `choices`, so one renderer
 * covers them — the item's `type` only changes the label, not the mechanics.
 * See assessments.format.js for why the server normalises them that way.
 *
 * The answer key never reaches this component. Marks come back from the
 * submit call, so a correct/incorrect breakdown is only available after the
 * paper is handed in.
 *
 * A quiz whose questions have not been written yet opens on an offer rather
 * than on a paper. Finishing the lesson unlocks the quiz but writes nothing —
 * writing costs a model call, so it waits for the student to say they are
 * actually ready. Choosing to come back later costs nothing at all.
 */
function QuizRunner({ studentId, assessment, onSubmitted, onGenerated, onBadgeEarned }) {
  const incomingId = assessment?.id ?? null;
  const moduleId = assessment?.moduleId ?? null;
  const needsGeneration = Boolean(assessment?.needsGeneration);

  // The id of the quiz that actually exists. Null until a quiz that has to be
  // written has been — the placeholder's id resolves to no document.
  const [resolvedId, setResolvedId] = useState(needsGeneration ? null : incomingId);
  const [state, setState] = useState(
    needsGeneration ? { status: "offer" } : { status: "loading" }
  );
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const assessmentId = resolvedId;

  // Opening a different quiz starts it over, offer and all.
  useEffect(() => {
    setResolvedId(needsGeneration ? null : incomingId);
    setState(needsGeneration ? { status: "offer" } : { status: "loading" });
    setAnswers({});
    setResult(null);
    setError("");
  }, [incomingId, needsGeneration]);

  useEffect(() => {
    if (!studentId || !assessmentId) return undefined;

    let active = true;
    setState({ status: "loading" });

    fetchAssessment(studentId, assessmentId)
      .then((data) => {
        if (!active) return;
        if (data.locked) {
          setState({ status: "locked", message: data.message });
          return;
        }
        setState({ status: "ready", assessment: data.assessment });
        // A quiz already sat opens straight to its mark.
        if (data.result) setResult(data.result);
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [studentId, assessmentId]);

  /**
   * "Take the Quiz" — the press that writes the questions.
   *
   * A failure returns to the offer with a note rather than to an error screen:
   * the student has lost nothing and the button is still the right next move.
   */
  const takeQuiz = async () => {
    if (!moduleId || state.status === "generating") return;

    setState({ status: "generating" });
    setError("");

    try {
      const response = await prepareLessonAssessment(studentId, moduleId);

      if (response.locked) {
        setState({ status: "locked", message: response.message });
        return;
      }
      if (response.unavailable || !response.assessment?.id) {
        setState({
          status: "offer",
          notice: response.message ?? "Your quiz could not be prepared. Try again."
        });
        return;
      }

      // Hand the real row up so the rail stops showing a placeholder.
      onGenerated?.(moduleId, response.assessment);
      setResolvedId(response.assessment.id);
    } catch (_error) {
      setState({
        status: "offer",
        notice: "Your quiz could not be prepared just now. Try again."
      });
    }
  };

  const items = state.assessment?.items ?? [];
  const answeredCount = useMemo(
    () => items.filter((item) => answers[item.id]).length,
    [items, answers]
  );
  const allAnswered = items.length > 0 && answeredCount === items.length;

  const choose = (itemId, choiceId) => {
    setAnswers((current) => ({ ...current, [itemId]: choiceId }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const payload = items.map((item) => ({ itemId: item.id, choice: answers[item.id] }));
      const response = await submitAssessment(studentId, assessmentId, payload);

      if (response.locked) {
        setState({ status: "locked", message: response.message });
        return;
      }

      setResult(response.result);
      if (response.alreadySubmitted) setError(response.message);
      onSubmitted?.(assessmentId, response.result);

      // Only ever set on a lesson quiz this submission just passed, so the
      // popup cannot fire for a paper that was already passed on an earlier
      // visit — reopening a finished quiz loads its mark without submitting.
      if (response.badge) onBadgeEarned?.(response.badge);
    } catch (_error) {
      setError("That submission did not go through. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // The quiz is the student's to take; it just has not been written yet.
  if (state.status === "offer") {
    return (
      <div className="sd-quiz__offer">
        <span className="sd-quiz__offer-icon">
          <QuizIcon size={22} />
        </span>
        <h3 className="sd-quiz__offer-title">Ready for the quiz?</h3>
        <p className="sd-quiz__offer-text">
          Your questions are written the moment you start, so take it when you have
          the time. Coming back later costs you nothing.
        </p>

        {state.notice ? <p className="sd-quiz__offer-note">{state.notice}</p> : null}

        <button type="button" className="sd-quiz__offer-btn" onClick={takeQuiz}>
          Take the Quiz
        </button>
      </div>
    );
  }

  if (state.status === "generating") {
    return (
      <div className="sd-quiz__offer">
        <span className="sd-quiz__offer-spinner" aria-hidden="true" />
        <h3 className="sd-quiz__offer-title">Generating your quiz…</h3>
        <p className="sd-quiz__offer-text">
          This takes a few moments. Keep this page open — your questions are being
          written from the lesson you just read.
        </p>
      </div>
    );
  }

  if (state.status === "loading") {
    return <p className="student-courses__status">Loading quiz…</p>;
  }

  if (state.status === "locked") {
    return (
      <div className="sd-quiz__locked">
        <span className="sd-quiz__locked-icon">
          <LockIcon size={18} />
        </span>
        <p className="student-courses__status">{state.message}</p>
      </div>
    );
  }

  if (state.status === "error") {
    return <p className="student-courses__status">This quiz could not be loaded.</p>;
  }

  const quiz = state.assessment;
  const done = Boolean(result);

  return (
    <div className="sd-quiz">
      <div className="sd-quiz__meta">
        <span className="sd-quiz__meta-item">
          <QuizIcon size={14} /> {quiz.itemCount} question
          {quiz.itemCount === 1 ? "" : "s"}
        </span>
        <span className="sd-quiz__meta-item">
          Pass mark {quiz.passMark} of {quiz.totalPoints}
        </span>
      </div>

      {quiz.description ? <p className="module-viewer__desc">{quiz.description}</p> : null}

      {done ? (
        <div className={`sd-quiz__result${result.passed ? " is-passed" : " is-failed"}`}>
          <p className="sd-quiz__score">
            {result.score} <span>/ {result.total}</span>
          </p>
          <p className="sd-quiz__verdict">
            {result.passed ? (
              <>
                <CheckIcon size={15} /> Passed — badge earned
              </>
            ) : (
              `Not passed. ${result.passMark} needed to earn the badge.`
            )}
          </p>
          {result.reviewStatus === "pending" ? (
            <p className="sd-quiz__note">
              An assessor still reviews this before the badge is released.
            </p>
          ) : null}
        </div>
      ) : null}

      <ol className="sd-quiz__items">
        {items.map((item, index) => (
          <li className="sd-quiz__item" key={item.id}>
            <p className="sd-quiz__q">
              <span className="sd-quiz__n">{index + 1}</span>
              {item.q}
              <span className="sd-quiz__type">
                {item.type === "true-false" ? "True or false" : "Multiple choice"}
              </span>
            </p>

            <div className="sd-quiz__choices" role="radiogroup" aria-label={item.q}>
              {item.choices.map((choice) => {
                const picked = answers[item.id] === choice.id;
                return (
                  <label
                    className={`sd-quiz__choice${picked ? " is-picked" : ""}`}
                    key={choice.id}
                  >
                    <input
                      type="radio"
                      name={`item-${item.id}`}
                      value={choice.id}
                      checked={picked}
                      disabled={done}
                      onChange={() => choose(item.id, choice.id)}
                    />
                    <span className="sd-quiz__choice-text">{choice.text}</span>
                  </label>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {error ? <p className="sd-quiz__error">{error}</p> : null}

      {!done ? (
        <div className="sd-quiz__actions">
          <span className="sd-quiz__progress">
            {answeredCount} of {items.length} answered
          </span>
          <button
            type="button"
            className="module-row__action"
            disabled={!allAnswered || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting…" : "Submit quiz"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default QuizRunner;
