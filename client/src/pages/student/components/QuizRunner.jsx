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
  // Which question is on screen. The paper is answered one question at a time,
  // in whatever order the student picks.
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const assessmentId = resolvedId;

  // Opening a different quiz starts it over, offer and all.
  useEffect(() => {
    setResolvedId(needsGeneration ? null : incomingId);
    setState(needsGeneration ? { status: "offer" } : { status: "loading" });
    setAnswers({});
    setCurrent(0);
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
  const question = items[current] ?? null;

  // A paper that arrives shorter than the one before it must not leave the
  // pager pointing past its end.
  useEffect(() => {
    setCurrent((index) => (index < items.length ? index : 0));
  }, [items.length]);

  /**
   * Where "Skip" lands: the next question with no answer on it, searched
   * forward and wrapped past the end so the last unanswered questions are
   * reachable from anywhere. Never the question already on screen — skipping
   * onto yourself is not a move — and null when nothing else is blank, which
   * is what hides the button.
   */
  const nextUnanswered = useMemo(() => {
    for (let step = 1; step < items.length; step += 1) {
      const index = (current + step) % items.length;
      if (!answers[items[index].id]) return index;
    }
    return null;
  }, [items, answers, current]);

  const goSkip = () => {
    if (nextUnanswered !== null) setCurrent(nextUnanswered);
  };

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

      {/* The number strip: which question you are on, which are answered, and
          the way to any of them. A quiz is answered in whatever order the
          student likes, so this is navigation rather than a progress read-out. */}
      <nav className="sd-quiz__pager" aria-label="Questions in this quiz">
        {items.map((item, index) => {
          const answered = Boolean(answers[item.id]);
          return (
            <button
              type="button"
              key={item.id}
              className={
                "sd-quiz__pager-btn" +
                (index === current ? " is-current" : "") +
                (answered ? " is-answered" : "")
              }
              aria-current={index === current ? "true" : undefined}
              aria-label={`Question ${index + 1}, ${answered ? "answered" : "not answered"}`}
              onClick={() => setCurrent(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      {question ? (
        <div className="sd-quiz__item sd-quiz__item--single" key={question.id}>
          <p className="sd-quiz__q">
            <span className="sd-quiz__n">{current + 1}</span>
            {question.q}
            <span className="sd-quiz__type">
              {question.type === "true-false" ? "True or false" : "Multiple choice"}
            </span>
          </p>

          <div className="sd-quiz__choices" role="radiogroup" aria-label={question.q}>
            {question.choices.map((choice) => {
              const picked = answers[question.id] === choice.id;
              return (
                <label
                  className={`sd-quiz__choice${picked ? " is-picked" : ""}`}
                  key={choice.id}
                >
                  <input
                    type="radio"
                    name={`item-${question.id}`}
                    value={choice.id}
                    checked={picked}
                    disabled={done}
                    onChange={() => choose(question.id, choice.id)}
                  />
                  <span className="sd-quiz__choice-text">{choice.text}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <p className="sd-quiz__error">{error}</p> : null}

      {/* Moving between questions. Skip and Next both go forward; they differ in
          where they land. Next is the next number, which is what someone
          working straight through wants. Skip hunts down the next question with
          no answer on it and wraps past the end to find one — so a student who
          left three blank on the way through is walked back to exactly those,
          rather than paging through the finished ones to reach them. */}
      <div className="sd-quiz__nav">
        <span className="sd-quiz__progress">
          Question {current + 1} of {items.length} · {answeredCount} answered
        </span>

        <div className="sd-quiz__nav-btns">
          {!done && nextUnanswered !== null ? (
            <button type="button" className="sd-quiz__skip" onClick={goSkip}>
              Skip
            </button>
          ) : null}

          <button
            type="button"
            className="module-row__action"
            disabled={current >= items.length - 1}
            onClick={() => setCurrent((index) => Math.min(index + 1, items.length - 1))}
          >
            Next question
          </button>
        </div>
      </div>

      {!done ? (
        <div className="sd-quiz__actions">
          <span className="sd-quiz__progress">
            {allAnswered
              ? "Every question answered — hand it in when you are ready."
              : `${items.length - answeredCount} still to answer`}
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
