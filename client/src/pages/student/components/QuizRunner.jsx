import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAssessment, submitAssessment } from "../../../services/assessments";
import {
  clearQuizDraft,
  draftIsOpen,
  draftOf,
  readQuizDraft,
  restoreQuizDraft,
  writeQuizDraft
} from "../quizDraft";
import { CheckIcon, ClockIcon, LockIcon, QuizIcon } from "./icons";
import { SkeletonText } from "../../../components/Skeleton";
import CodeBlock from "../../../components/CodeBlock";
import AssessmentBrief from "./AssessmentBrief";
import { LOW_TIME_MS, clockFace, spokenTimeLeft } from "../assessmentClock";

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
  /* What the student has actually opened. Every line on this screen said
     "quiz" whatever it was, so a final exam was handed in under a button
     marked Submit quiz — and told the student a badge had been earned, which a
     final does not earn.

     Read off the rail's summary rather than the loaded paper, because the
     loading and locked states are on screen before the paper arrives and they
     have to name it too. The two agree: both carry the same scope. */
  const isFinal = assessment?.scope === "final";
  const paper = isFinal ? "final exam" : "quiz";
  // Why it is shut, as the rail was told. Only read for a placeholder — a real
  // paper is refused by the server, which sends its own reason with the 423,
  // and that one is authoritative where the rail may be a moment out of date.
  const lockedReason = assessment?.reason ?? `Your assessor will unlock this ${paper}.`;
  const [state, setState] = useState({ status: "loading" });
  const [answers, setAnswers] = useState({});
  // Which question is on screen. The paper is answered one question at a time,
  // in whatever order the student picks.
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Set when Retake is pressed and read by the fetch below, where it is what
  // tells the server this request is a new attempt rather than somebody
  // reopening their mark. A ref because nothing on screen reads it, and
  // because clearing it must not send the effect that reads it round again.
  const startingAgain = useRef(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  // When this sitting began. A ref rather than state because nothing on screen
  // depends on it — it must not cause a redraw, and a redraw must not reset it.
  // The server never sees the paper being worked on, only fetched and handed
  // in, so this is the only place the length of a sitting can be observed.
  const startedAt = useRef(null);
  /*
   * Whether this sitting has begun.
   *
   * "brief" is the paper face down: nothing has been asked of the server, so
   * no attempt is registered and no clock is running. "open" is the paper
   * turned over. The split exists because fetching the questions is itself
   * the act of starting — see openAttempt — so a screen that described the
   * paper by loading it would have started it to ask whether to start it.
   */
  const [phase, setPhase] = useState("brief");
  const [starting, setStarting] = useState(false);
  // When this sitting must be in, as the server reckons it. Null on an
  // untimed paper and on one being reviewed rather than taken.
  const [clock, setClock] = useState(null);
  const [msLeft, setMsLeft] = useState(null);
  // So the paper can only ever hand itself in once, however many ticks land
  // on zero while the request is in flight.
  const handedIn = useRef(false);
  // The attempt whose mark was on screen when a retake began, or null on a
  // first attempt. Kept with the draft so a reload mid-retake reopens the
  // retake, not the old mark (see quizDraft.js).
  const retakeOf = useRef(null);

  // Opening a different quiz starts it over.
  useEffect(() => {
    setState({ status: "loading" });
    setAnswers({});
    setCurrent(0);
    setResult(null);
    setError("");
    setClock(null);
    setMsLeft(null);
    startedAt.current = null;
    retakeOf.current = null;
    handedIn.current = false;
    startingAgain.current = false;
    setStarting(false);

    /*
     * Two things open a paper without anybody pressing Start, and neither is
     * a new sitting: a paper already handed in reopens as its mark, and a
     * paper left half-finished reopens where it was left. Both are answered
     * from what the rail already sent and what this browser kept, so the
     * decision costs no request — which matters, because the request is the
     * thing that would start the clock.
     */
    const taken = Boolean(assessment?.result);
    const resuming = draftIsOpen(readQuizDraft(studentId, assessmentId), assessment?.result ?? null);
    // A paper the rail already calls shut is not briefed either: there is
    // nothing to start, and the server's reason is the one worth showing —
    // asking for it is how that reason is got.
    const shut = Boolean(assessment?.locked);
    setPhase(taken || resuming || shut ? "open" : "brief");
  }, [assessmentId, studentId, assessment?.result]);

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

    // Face down. Nothing is asked for until Start.
    if (phase === "brief") return undefined;

    let active = true;
    setState({ status: "loading" });

    // Read once and cleared here: a retake is this request and not the next
    // one, and leaving it set would turn a later reload into another attempt.
    const retake = startingAgain.current;
    startingAgain.current = false;

    fetchAssessment(studentId, assessmentId, { retake })
      .then((data) => {
        if (!active) return;
        if (data.locked) {
          setState({ status: "locked", message: data.message });
          return;
        }

        setClock(data.clock ?? null);

        // A fresh attempt: the mark that was on screen goes, and so do the
        // answers that earned it. Not a draft to restore — that paper is in.
        if (retake) {
          setState({ status: "ready", assessment: data.assessment });
          setResult(null);
          setAnswers({});
          setCurrent(0);
          startedAt.current = Date.now();
          clearQuizDraft(studentId, assessmentId);
          return;
        }

        // A paper left mid-way — a reload, a closed tab, a dropped connection —
        // comes back as it was left, timed from when it was first opened.
        const draft = readQuizDraft(studentId, assessmentId);
        if (draftIsOpen(draft, data.result)) {
          const restored = restoreQuizDraft(data.assessment, draft);
          setState({ status: "ready", assessment: restored.assessment });
          setAnswers(restored.answers);
          setCurrent(restored.current);
          startedAt.current = draft.startedAt ?? Date.now();
          retakeOf.current = draft.retakeOf ?? null;
          return;
        }
        if (draft) clearQuizDraft(studentId, assessmentId);

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
  }, [studentId, assessmentId, placeholder, lockedReason, phase]);

  // Every change to an unmarked paper is kept in the browser as it happens.
  // Keyed by the paper in state rather than the prop, so the render between
  // switching quizzes and the new one loading cannot file one under the other.
  useEffect(() => {
    const paper = state.assessment;
    if (state.status !== "ready" || !paper || result) return;
    writeQuizDraft(
      studentId,
      paper.id,
      draftOf(paper, answers, current, startedAt.current, retakeOf.current)
    );
  }, [studentId, state, answers, current, result]);

  /*
   * The countdown.
   *
   * Counted against the server's `endsAt` rather than by subtracting a second
   * a second: an interval that misses ticks — a backgrounded tab, a sleeping
   * machine — would otherwise leave the student more time the longer they
   * looked away. Reading the wall clock each tick means a tab reopened after
   * an hour shows what it should, which is nothing left.
   */
  useEffect(() => {
    if (phase !== "open" || result || !clock?.endsAt) return undefined;

    const endsAt = new Date(clock.endsAt).getTime();
    if (Number.isNaN(endsAt)) return undefined;

    const tick = () => setMsLeft(endsAt - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [phase, result, clock]);

  /*
   * Time's up. The paper goes in as it stands.
   *
   * Guarded by a ref rather than by the submitting flag alone, because the
   * tick that reaches zero and the tick after it are a second apart and the
   * request is not always back by then — twice would be two attempts.
   */
  useEffect(() => {
    if (msLeft === null || msLeft > 0) return;
    if (result || submitting || handedIn.current) return;
    handedIn.current = true;
    handleSubmit({ force: true });
  });

  /*
   * What is said out loud, and when.
   *
   * At the marks an invigilator calls — half an hour, fifteen, ten, five, one,
   * and time — and once each. Announcing the countdown itself would read the
   * digits over whatever the student was listening to, once a second, for the
   * length of the paper.
   */
  const [spoken, setSpoken] = useState("");
  const lastCall = useRef(null);

  useEffect(() => {
    if (msLeft === null) return;
    const minutes = msLeft <= 0 ? 0 : Math.ceil(msLeft / 60000);
    if (![30, 15, 10, 5, 1, 0].includes(minutes) || lastCall.current === minutes) return;
    lastCall.current = minutes;
    setSpoken(spokenTimeLeft(msLeft));
  }, [msLeft]);

  const items = state.assessment?.items ?? [];
  const answeredCount = useMemo(
    () => items.filter((item) => answers[item.id]).length,
    [items, answers]
  );
  const allAnswered = items.length > 0 && answeredCount === items.length;
  const question = items[current] ?? null;
  // The end of the paper, which is where handing it in lives.
  const isLast = items.length > 0 && current === items.length - 1;

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

  /**
   * Hand the paper in.
   *
   * `force` is the clock running out, and it is the one case where an
   * unfinished paper goes in: the sitting is over, so what is on it is what
   * was done in the time. Every other route waits for the last question,
   * because handing in early is a mistake nobody can undo.
   */
  const handleSubmit = async ({ force = false } = {}) => {
    if (submitting) return;
    if (!force && !allAnswered) return;

    setSubmitting(true);
    setError("");

    try {
      // Blank where nothing was chosen, which the server marks wrong — an
      // unanswered question on a paper that ran out of time is a question
      // that was not answered.
      const payload = items.map((item) => ({ itemId: item.id, choice: answers[item.id] ?? "" }));
      // Null when the paper was reopened rather than taken — there is no
      // sitting to measure then, and sending zero would record one.
      const took = startedAt.current ? Date.now() - startedAt.current : null;
      const response = await submitAssessment(studentId, assessmentId, payload, took);

      if (response.locked) {
        // Kept: the answers are still theirs if the quiz opens again.
        setState({ status: "locked", message: response.message });
        return;
      }

      clearQuizDraft(studentId, assessmentId);
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
   * This turns the paper face down rather than fetching another one. A retake
   * is a sitting — on a timed paper it is a fresh clock, which starts the
   * moment the questions are asked for — so it is briefed like the first one,
   * and the student presses Start when they are ready rather than finding
   * themselves already a minute into their last attempt.
   *
   * Re-fetching is still the whole mechanism behind it: the server reshuffles
   * the questions and their choices on every call, so a retake costs nothing
   * to produce — the bank was written once and no model is asked for anything.
   */
  const handleRetake = () => {
    if (!assessmentId) return;

    // The attempt this retake follows, kept for the draft so a reload
    // mid-retake reopens the retake rather than the mark it replaced.
    retakeOf.current = result?.attempt ?? null;
    startingAgain.current = true;
    handedIn.current = false;
    setError("");
    setClock(null);
    setMsLeft(null);
    setStarting(false);
    setPhase("brief");
  };

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

  // The paper face down. Checked after the lock, because a paper nobody can
  // open has nothing to brief, and before the loading state, because until
  // Start is pressed there is nothing being loaded.
  if (phase === "brief") {
    return (
      <AssessmentBrief
        assessment={assessment}
        result={result ?? assessment?.result ?? null}
        starting={starting}
        error={error}
        onStart={() => {
          setStarting(true);
          setPhase("open");
        }}
      />
    );
  }

  if (state.status === "loading") {
    return <SkeletonText lines={4} label={`Loading ${paper}…`} />;
  }

  if (state.status === "error") {
    return <p className="student-courses__status">This {paper} could not be loaded.</p>;
  }

  const quiz = state.assessment;
  const done = Boolean(result);

  return (
    <div className="sd-quiz">
      {/* Pinned, so it is on screen at question fifty-one as well as at
          question one. It is the strip of facts about this paper and the time
          left is one of them, so it belongs here rather than in a badge of
          its own floating somewhere else. */}
      <div className="sd-quiz__meta">
        <span className="sd-quiz__meta-item">
          <QuizIcon size={14} /> {quiz.itemCount} question
          {quiz.itemCount === 1 ? "" : "s"}
        </span>
        <span className="sd-quiz__meta-item">
          Pass mark {quiz.passMark} of {quiz.totalPoints}
        </span>
        {msLeft !== null && !done ? (
          <span
            className={`sd-quiz__meta-item sd-clock${
              msLeft <= 0 ? " is-out" : msLeft <= LOW_TIME_MS ? " is-low" : ""
            }`}
            role="timer"
          >
            <ClockIcon size={14} />
            <span className="sd-clock__face" aria-hidden="true">
              {msLeft <= 0 ? "Time's up" : clockFace(msLeft)}
            </span>
            {/* The digits read out as a time of day, so the spoken form is
                its own sentence — and only at the marks an invigilator would
                call, because a live region that talks every second talks over
                everything the student is trying to read. */}
            <span className="sd-sr-only" aria-live="polite">
              {spoken}
            </span>
          </span>
        ) : null}
      </div>

      {quiz.description ? <p className="module-viewer__desc">{quiz.description}</p> : null}

      {done ? (
        <div className={`sd-quiz__result${result.passed ? " is-passed" : " is-failed"}`}>
          <p className="sd-quiz__score">
            {result.score} <span>/ {result.total}</span>
          </p>
          {/* A passed lesson quiz earns a badge, which is the student's the
              moment they pass. A passed final earns the course credential,
              which is the assessor's to release — so it is not earned yet, and
              saying "badge earned" was wrong twice over: wrong award, and
              wrong about who has it. "Awaiting release" is the words the
              Certifications card already uses for the same state. */}
          <p className="sd-quiz__verdict">
            {result.passed ? (
              <>
                <CheckIcon size={15} />{" "}
                {isFinal ? "Passed — credential awaiting release" : "Passed — badge earned"}
              </>
            ) : isFinal ? (
              `Not passed. ${result.passMark} needed to earn the credential.`
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
              <button type="button" className="module-row__action" onClick={handleRetake}>
                Retake
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* The number strip: which question you are on, which are answered, and
          the way to any of them. A quiz is answered in whatever order the
          student likes, so this is navigation rather than a progress read-out. */}
      <nav className="sd-quiz__pager" aria-label={`Questions in this ${paper}`}>
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

          {/* The question asks about the code, so it is read first; the code
              sits between it and the answers, where it is traced. */}
          <CodeBlock code={question.code} className="sd-quiz__code" />

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
          rather than paging through the finished ones to reach them.

          On the last question the same button hands the paper in. It used to be
          a second button in a row of its own, live from the first question on
          and greyed out for most of the paper — a control the student could not
          use yet, sitting under one they could. Now there is one button in that
          corner throughout, and reaching the end of the paper is what turns it
          into the way out. Skip stays beside it while anything is still blank,
          which is how the last few unanswered questions are reached from here. */}
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

          {isLast && !done ? (
            <button
              type="button"
              className="module-row__action"
              disabled={!allAnswered || submitting}
              onClick={() => handleSubmit()}
            >
              {submitting ? "Submitting…" : `Submit ${paper}`}
            </button>
          ) : (
            <button
              type="button"
              className="module-row__action"
              disabled={isLast}
              onClick={() => setCurrent((index) => Math.min(index + 1, items.length - 1))}
            >
              Next question
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuizRunner;
