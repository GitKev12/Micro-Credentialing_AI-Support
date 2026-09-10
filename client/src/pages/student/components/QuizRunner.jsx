import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAssessment, submitAssessment } from "../../../services/assessments";
import { CheckIcon, LockIcon, QuizIcon } from "./icons";
import { SkeletonText } from "../../../components/Skeleton";

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
 * Nothing is written here. A quiz exists because an assessor generated it and
 * posted it to the course; until then the rail's row is a locked placeholder
 * and this component is never opened on it.
 */
function QuizRunner({ studentId, assessment, onSubmitted, onBadgeEarned, onOpenLesson }) {
  const assessmentId = assessment?.id ?? null;
  // A row standing in for a paper that was never written, or written and not
  // yet posted. There is no document behind its id.
  const placeholder = Boolean(assessment?.placeholder);
  // Why it is shut, as the rail was told. Only read for a placeholder — a real
  // paper is refused by the server, which sends its own reason with the 423,
  // and that one is authoritative where the rail may be a moment out of date.
  const lockedReason = assessment?.reason ?? "Your assessor will unlock this quiz.";
  const [state, setState] = useState({ status: "loading" });
  const [answers, setAnswers] = useState({});
  // Which question is on screen. The paper is answered one question at a time,
  // in whatever order the student picks.
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  // When this sitting began. A ref rather than state because nothing on screen
  // depends on it — it must not cause a redraw, and a redraw must not reset it.
  // The server never sees the paper being worked on, only fetched and handed
  // in, so this is the only place the length of a sitting can be observed.
  const startedAt = useRef(null);

  // Opening a different quiz starts it over.
  useEffect(() => {
    setState({ status: "loading" });
    setAnswers({});
    setCurrent(0);
    setResult(null);
    setError("");
    startedAt.current = null;
  }, [assessmentId]);

  useEffect(() => {
    if (!studentId || !assessmentId) return undefined;

    // Nothing to ask for: a placeholder's id resolves to no document, so the
    // request would come back a 404 and be shown as a quiz that failed to
    // load — which is not what happened. Nobody has posted it yet, and the
    // row already carries the sentence that says so.
    if (placeholder) {
      setState({ status: "locked", message: lockedReason });
      return undefined;
    }

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
        startedAt.current = Date.now();

        // A quiz already sat opens straight to its mark — and to the answers
        // that earned it. Restoring them is what makes reopening a paper a
        // review rather than a blank form: every question shows the choice the
        // student made, and the marks have something to sit against.
        if (data.result) {
          setResult(data.result);
          setAnswers(
            Object.fromEntries(
              (data.result.items ?? [])
                .filter((item) => item.choice)
                .map((item) => [String(item.itemId), item.choice])
            )
          );
        }
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [studentId, assessmentId, placeholder, lockedReason]);

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

  /**
   * How each question was marked, once the paper is in. Empty until then, which
   * is what keeps the strip neutral while the quiz is still being answered —
   * a number must not go red for a question that has simply not been marked yet.
   */
  const verdicts = useMemo(() => {
    const byItem = new Map();
    for (const item of result?.items ?? []) byItem.set(String(item.itemId), item.verdict);
    return byItem;
  }, [result]);

  // How the question on screen was marked — null while the paper is unmarked.
  const questionVerdict = question ? (verdicts.get(String(question.id)) ?? null) : null;

  const choose = (itemId, choiceId) => {
    setAnswers((current) => ({ ...current, [itemId]: choiceId }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const payload = items.map((item) => ({ itemId: item.id, choice: answers[item.id] }));
      // Null when the paper was reopened rather than taken — there is no
      // sitting to measure then, and sending zero would record one.
      const took = startedAt.current ? Date.now() - startedAt.current : null;
      const response = await submitAssessment(studentId, assessmentId, payload, took);

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

  /**
   * Sit the paper again.
   *
   * Re-fetching is the whole mechanism: the server reshuffles the questions and
   * their choices on every call, so a retake costs nothing to produce — the
   * bank was written once and no model is asked for anything here.
   *
   * The previous mark comes back in that response and is deliberately dropped.
   * The student is starting a fresh attempt, and showing last time's score
   * above a blank paper would only invite them to re-enter the same answers.
   */
  const handleRetake = async () => {
    if (retaking || !assessmentId) return;

    setRetaking(true);
    setError("");

    try {
      const data = await fetchAssessment(studentId, assessmentId, { retake: true });

      if (data.locked) {
        setState({ status: "locked", message: data.message });
        return;
      }

      setState({ status: "ready", assessment: data.assessment });
      setResult(null);
      setAnswers({});
      setCurrent(0);
      // A retake is its own sitting, timed from here — not from whenever the
      // first attempt was opened.
      startedAt.current = Date.now();
    } catch (_error) {
      setError("Could not start another attempt. Try again.");
    } finally {
      setRetaking(false);
    }
  };

  if (state.status === "loading") {
    return <SkeletonText lines={4} label="Loading quiz…" />;
  }

  if (state.status === "locked") {
    return (
      <div className="sd-quiz__locked">
        <span className="sd-quiz__locked-icon">
          <LockIcon size={24} />
        </span>
        <p className="sd-quiz__locked-text">{state.message}</p>
        {/* There is one thing a student can do about a shut quiz, and only
            sometimes: read the lesson that opens it. The caller decides
            whether that is what is holding this one — a quiz waiting on its
            assessor gets no button, because there would be nothing behind
            it. */}
        {onOpenLesson ? (
          <button type="button" className="sd-quiz__locked-btn" onClick={onOpenLesson}>
            Go to the lesson
          </button>
        ) : null}
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
          <div className="sd-quiz__retake">
            <span className="sd-quiz__attempts">
              {result.attemptsAllowed
                ? `Attempt ${result.attempt} of ${result.attemptsAllowed}`
                : `Attempt ${result.attempt}`}
              {result.attemptsLeft === 0
                ? " — no attempts left"
                : result.attemptsLeft
                  ? ` — ${result.attemptsLeft} left`
                  : " — retake as often as you like"}
            </span>

            {result.canRetake ? (
              <button
                type="button"
                className="module-row__action"
                disabled={retaking}
                onClick={handleRetake}
              >
                {retaking ? "Starting…" : "Retake"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* The number strip: which question you are on, which are answered, and
          the way to any of them. A quiz is answered in whatever order the
          student likes, so this is navigation rather than a progress read-out. */}
      <nav className="sd-quiz__pager" aria-label="Questions in this quiz">
        {items.map((item, index) => {
          const answered = Boolean(answers[item.id]);
          const verdict = verdicts.get(String(item.id)) ?? null;
          // Marked state replaces answered state rather than stacking on it:
          // once a paper is in, "you put something here" stops being the useful
          // fact and "you got it wrong" starts being it.
          const marked = verdict === "correct" || verdict === "incorrect";

          return (
            <button
              type="button"
              key={item.id}
              className={
                "sd-quiz__pager-btn" +
                (index === current ? " is-current" : "") +
                (marked
                  ? verdict === "correct"
                    ? " is-correct"
                    : " is-wrong"
                  : answered
                    ? " is-answered"
                    : "")
              }
              aria-current={index === current ? "true" : undefined}
              aria-label={
                marked
                  ? `Question ${index + 1}, ${verdict === "correct" ? "correct" : "incorrect"}`
                  : `Question ${index + 1}, ${answered ? "answered" : "not answered"}`
              }
              onClick={() => setCurrent(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      {question ? (
        <div className="sd-quiz__item sd-quiz__item--single" key={question.id}>
          {/* Context first, then the question, then the answers. The three used
              to share one wrapping paragraph — badge, question and type pill on
              a baseline — which put the item's label in the middle of the
              sentence on any question long enough to wrap. */}
          <div className="sd-quiz__qhead">
            <span className="sd-quiz__qcount">
              Question {current + 1} of {items.length}
            </span>
            <span className="sd-quiz__type">
              {question.type === "true-false" ? "True or false" : "Multiple choice"}
            </span>
          </div>

          <p className="sd-quiz__q">{question.q}</p>

          <div className="sd-quiz__choices" role="radiogroup" aria-label={question.q}>
            {question.choices.map((choice) => {
              const picked = answers[question.id] === choice.id;
              // Once marked, the answer the student put down carries the
              // verdict for this question. Only their own choice is coloured:
              // the paper's key is not sent here and is not being revealed by
              // the back door — a wrong row says "not this", never "that one".
              const verdictClass =
                picked && questionVerdict === "correct"
                  ? " is-correct"
                  : picked && questionVerdict === "incorrect"
                    ? " is-wrong"
                    : "";

              return (
                <label
                  className={`sd-quiz__choice${picked ? " is-picked" : ""}${verdictClass}`}
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
