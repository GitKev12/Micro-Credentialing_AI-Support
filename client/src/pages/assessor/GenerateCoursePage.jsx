import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchCourseAssessment,
  fetchCourseAssessments,
  generateCourseAssessment,
  postCourseAssessment,
  storedAssessorId,
  unpostCourseAssessment,
  updateCourseAssessment
} from "../../services/assessors";
import { CheckIcon, ClockIcon, GenerateIcon, PencilIcon } from "./components/icons";
import { AssessorSelect, Chip, ScreenHeader } from "./components/ui";
import { SkeletonText } from "../../components/Skeleton";
import { noticeClass, useNotice } from "../../lib/useNotice";
import { DEFAULT_MINUTES, timeLimitFor } from "./timeLimit";

/**
 * Generating one course's papers.
 *
 * Three things happen on this screen, and they are laid out in the order they
 * happen in. The questions and their answers fill the left, because reading
 * them is the work; the two cards on the right are what produced them and what
 * releases them.
 *
 *   Assessment    — quiz or final, which lesson, how many questions, how long
 *                   the sitting runs. Pressing generate reads the lesson's
 *                   extracted text and writes a draft.
 *   Review & post — pick a question by its number to correct it, then post.
 *                   Posting applies to the whole class at once: an Assessment
 *                   holds no student, so there is nothing per-student to set.
 *
 * A draft is invisible to students until it is posted. That is the point of the
 * screen — a wrong answer key found here is found before a class sits it.
 */

const clampCount = (value) => Math.max(1, Math.min(120, Math.floor(Number(value) || 0)));

/** A quiz's default length when the blueprint has not been consulted yet. */
const DEFAULT_ITEMS = 10;

/** A final's, which is the length the imported Tables of Specification set. */
const DEFAULT_FINAL_ITEMS = 60;

/* ─────────────────────────── One question ─────────────────────────── */

/**
 * A question as written, or the form that corrects it.
 *
 * Both live in one component because they are one thing to the assessor: the
 * question they are reading is the question they are fixing, and swapping a
 * separate editor in over the top would lose their place in a paper of thirty.
 */
function QuestionCard({ item, editing, saving, onEdit, onCancel, onSave, readOnly }) {
  const [text, setText] = useState(item.q);
  const [choices, setChoices] = useState(item.choices);
  const [key, setKey] = useState(item.key);

  // Reopening a question, or a fresh generation landing under it, starts the
  // form from what is actually stored rather than from the last edit.
  useEffect(() => {
    setText(item.q);
    setChoices(item.choices);
    setKey(item.key);
  }, [item, editing]);

  const setChoiceText = (id, value) =>
    setChoices((current) =>
      current.map((choice) => (choice.id === id ? { ...choice, text: value } : choice))
    );

  if (!editing) {
    return (
      <li className="gen-q" id={`question-${item.id}`}>
        <div className="gen-q__head">
          <span className="gen-q__num">{item.n}</span>
          <p className="gen-q__text">{item.q}</p>
          {readOnly ? null : (
            <button type="button" className="gen-q__edit" onClick={onEdit}>
              <PencilIcon size={14} />
              Edit
            </button>
          )}
        </div>

        <ul className="choice-list">
          {item.choices.map((choice) => (
            <li key={choice.id} className={`choice${choice.id === item.key ? " is-key" : ""}`}>
              <span className="choice__id">{choice.id}</span>
              <span className="choice__text">{choice.text}</span>
              {choice.id === item.key ? (
                <span className="choice__tags">
                  <span className="choice__tag choice__tag--key">Correct answer</span>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li className="gen-q is-editing" id={`question-${item.id}`}>
      <div className="gen-q__head">
        <span className="gen-q__num">{item.n}</span>
        <textarea
          className="gen-input gen-input--area"
          value={text}
          rows={2}
          aria-label={`Question ${item.n}`}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {/* The radio is the answer key. Marking the right option is the whole
          reason this form exists — a generated question whose stated answer is
          wrong would otherwise mark a whole class wrong. */}
      <ul className="choice-list">
        {choices.map((choice) => (
          <li key={choice.id} className={`choice${choice.id === key ? " is-key" : ""}`}>
            <label className="gen-q__radio">
              <input
                type="radio"
                name={`key-${item.id}`}
                checked={choice.id === key}
                onChange={() => setKey(choice.id)}
              />
              <span className="assessor-sr-only">Mark {choice.id} as the correct answer</span>
            </label>
            <span className="choice__id">{choice.id}</span>
            <input
              type="text"
              className="gen-input"
              value={choice.text}
              aria-label={`Choice ${choice.id}`}
              disabled={item.type === "true-false"}
              onChange={(event) => setChoiceText(choice.id, event.target.value)}
            />
          </li>
        ))}
      </ul>

      <div className="gen-q__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || !text.trim()}
          onClick={() => onSave({ id: item.id, q: text.trim(), choices, key })}
        >
          {saving ? "Saving…" : "Save question"}
        </button>
      </div>
    </li>
  );
}

/* ─────────────────────────── The screen ─────────────────────────── */

function GenerateCoursePage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const assessorId = storedAssessorId();

  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // What the right-hand card is aimed at.
  const [scope, setScope] = useState("lesson");
  const [moduleId, setModuleId] = useState("");
  const [itemCount, setItemCount] = useState(DEFAULT_ITEMS);
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);

  const [paper, setPaper] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState("");
  // Three seconds and it fades, like every other console's — see useNotice.
  // The `closed` line below it is not one of these: a course whose run is over
  // stays over, and that banner has to stay with it.
  const [notice, setNotice] = useNotice();
  // Generating a lesson quiz is the only press on this screen that spends
  // money, so it asks first rather than firing on the click that reaches it.
  const [confirming, setConfirming] = useState(false);

  const reload = useCallback(async () => {
    if (!assessorId || !courseId) return null;
    const data = await fetchCourseAssessments(assessorId, courseId);
    setOverview(data);
    return data;
  }, [assessorId, courseId]);

  useEffect(() => {
    let active = true;

    reload()
      .then((data) => {
        if (!active || !data) return;
        // Open on the first lesson that has no posted paper yet — the one the
        // assessor came here for — and fall back to the first lesson.
        const owed = data.lessons.find((lesson) => lesson.assessment?.status !== "posted");
        setModuleId(String((owed ?? data.lessons[0])?.moduleId ?? ""));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reload]);

  const lessons = overview?.lessons ?? [];
  const course = overview?.course ?? null;

  const lesson = useMemo(
    () => lessons.find((row) => String(row.moduleId) === String(moduleId)) ?? null,
    [lessons, moduleId]
  );

  // The paper the two cards are pointed at, as the overview knows it.
  const target = scope === "final" ? (overview?.final ?? null) : (lesson?.assessment ?? null);

  // Load the questions whenever the target changes, and clear them when the
  // target has no paper — a stale question list under a lesson that has none is worse
  // than an empty panel.
  useEffect(() => {
    let active = true;

    setNotice(null);
    setConfirming(false);

    if (!target?.id) {
      setPaper(null);
      setEditingId(null);
      return undefined;
    }

    fetchCourseAssessment(assessorId, courseId, target.id)
      .then((loaded) => {
        if (!active) return;
        setPaper(loaded);
        setEditingId(null);
        setItemCount(loaded?.itemCount ?? DEFAULT_ITEMS);
        setTimed(Boolean(loaded?.timeLimitMinutes));
        setMinutes(loaded?.timeLimitMinutes ?? DEFAULT_MINUTES);
      })
      .catch(() => {
        if (active) setPaper(null);
      });

    return () => {
      active = false;
    };
  }, [assessorId, courseId, target?.id]);

  // A final runs an hour and a half unless someone says otherwise; a quiz is
  // untimed unless someone says otherwise. Only applied where there is no paper to read it off.
  useEffect(() => {
    if (target?.id) return;
    setPaper(null);
    setTimed(scope === "final");
    setMinutes(DEFAULT_MINUTES);
    setItemCount(scope === "final" ? DEFAULT_FINAL_ITEMS : DEFAULT_ITEMS);
  }, [scope, moduleId, target?.id]);

  const students = course?.students ?? 0;
  const posted = target?.status === "posted";
  // How the class stands on this paper, which is now read for one number only
  // — how many people have handed it in. Null until the paper is posted: a
  // draft has been released to nobody. The open paper is the fresher of the
  // two reads, so it answers first.
  const takers = paper?.takers ?? target?.takers ?? null;
  // Attempts on record, not people: three goes at one quiz is three rows.
  // That is the right number for the lock — any submission at all freezes the
  // questions, because the marks already given were earned against them — and
  // the wrong one for a sentence about students, which counts people.
  const taken = target?.submissions ?? 0;
  const locked = taken > 0;

  // People, for the sentence that names them. Falls back to the attempt
  // count for a paper posted before this was recorded, which is the number
  // that used to be printed there either way.
  const handedIn = takers?.submitted ?? taken;

  // The course itself is shut to new papers: its run is over, or every class
  // on it has been switched off. The server refuses generating, correcting and
  // posting either way, so the screen turns those off rather than offering a
  // press that comes back 423. Unposting stays available — see the server's
  // resolveWritableScope.
  const closed = course?.closed ?? null;
  const frozen = locked || Boolean(closed);

  const requestedMinutes = timeLimitFor({ timed, minutes });

  const run = async (label, work) => {
    setBusy(label);
    setNotice(null);
    try {
      const result = await work();
      if (result?.error) setNotice({ tone: "error", text: result.error });
      return result;
    } finally {
      setBusy("");
    }
  };

  const generate = () =>
    run("generate", async () => {
      setConfirming(false);
      const result = await generateCourseAssessment(assessorId, courseId, {
        scope,
        moduleId: scope === "final" ? null : moduleId,
        itemCount: clampCount(itemCount),
        timeLimitMinutes: requestedMinutes
      });

      if (result.assessment) {
        setPaper(result.assessment);
        setEditingId(null);
        setNotice({
          tone: "ok",
          text: `${result.assessment.itemCount} questions written. Read them before posting.`
        });
        await reload();
      }
      return result;
    });

  const applySettings = () =>
    run("settings", async () => {
      const result = await updateCourseAssessment(assessorId, courseId, paper.id, {
        timeLimitMinutes: requestedMinutes
      });
      if (result.assessment) {
        setPaper(result.assessment);
        await reload();
      }
      return result;
    });

  const saveQuestion = (patch) =>
    run("question", async () => {
      const result = await updateCourseAssessment(assessorId, courseId, paper.id, {
        items: [patch]
      });
      if (result.assessment) {
        setPaper(result.assessment);
        setEditingId(null);
        setNotice({ tone: "ok", text: "Question saved." });
      }
      return result;
    });

  const post = () =>
    run("post", async () => {
      const result = await postCourseAssessment(assessorId, courseId, paper.id);
      if (result.assessment) {
        setNotice({
          tone: "ok",
          text: `Posted to ${students} student${students === 1 ? "" : "s"} in this course.`
        });
        await reload();
      }
      return result;
    });

  const unpost = () =>
    run("unpost", async () => {
      const result = await unpostCourseAssessment(assessorId, courseId, paper.id);
      if (result.assessment) {
        setNotice({ tone: "ok", text: "Unposted. Students can no longer see this assessment." });
        await reload();
      }
      return result;
    });

  const items = paper?.items ?? [];

  const openQuestion = (item) => {
    setEditingId(item.id);
    document.getElementById(`question-${item.id}`)?.scrollIntoView({ block: "center" });
  };

  if (isLoading) {
    return (
      <>
        <ScreenHeader
          back={{ label: "Generate Assessment", onClick: () => navigate("/assessor/generate") }}
          title="Assessment"
        />
        <div className="assessor-body">
          <SkeletonText lines={5} label="Loading this course's assessments…" />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        back={{ label: "Generate Assessment", onClick: () => navigate("/assessor/generate") }}
        eyebrow={course ? `${course.code} · ${students} student${students === 1 ? "" : "s"}` : ""}
        title={course?.name ?? "Course"}
      />

      <div className="assessor-body gen-workspace">
        {/* ── Left: the paper as written ── */}
        <section className="gen-paper">
          <header className="gen-paper__head">
            <div style={{ minWidth: 0 }}>
              <h2 className="assessor-card-title" style={{ margin: 0 }}>
                {paper?.title || (scope === "final" ? "Final assessment" : "Lesson quiz")}
              </h2>
              <p className="assessor-meta" style={{ marginTop: "var(--sp-1)" }}>
                {paper
                  ? `${paper.itemCount} questions · ${paper.totalPoints} points · pass mark ${paper.passMark}`
                  : "Nothing written for this assessment yet."}
              </p>
            </div>

            <div className="gen-paper__tags">
              {paper ? (
                <Chip tone={posted ? "success" : "brand-soft"} dot>
                  {posted ? "Posted" : "Draft"}
                </Chip>
              ) : null}
              {paper?.timeLimitMinutes ? (
                <Chip tone="neutral">
                  <ClockIcon size={13} />
                  {paper.timeLimitMinutes} min
                </Chip>
              ) : null}
              {closed ? (
                <Chip tone="danger" dot>
                  {closed.suspended ? "Classes off" : "Course ended"}
                </Chip>
              ) : null}
            </div>
          </header>

          {closed ? <p className="gen-notice is-error">{closed.reason}</p> : null}

          {notice ? (
            <p
              className={noticeClass(
                notice,
                `gen-notice${notice.tone === "error" ? " is-error" : ""}`
              )}
              role="status"
            >
              {notice.text}
            </p>
          ) : null}

          {items.length > 0 ? (
            <ol className="gen-q-list">
              {items.map((item) => (
                <QuestionCard
                  key={item.id}
                  item={item}
                  editing={editingId === item.id}
                  saving={busy === "question"}
                  readOnly={frozen}
                  onEdit={() => setEditingId(item.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={saveQuestion}
                />
              ))}
            </ol>
          ) : (
            <div className="gen-empty">
              <span className="gen-empty__icon" aria-hidden="true">
                <GenerateIcon size={26} />
              </span>
              <p className="gen-empty__title">No questions yet</p>
            </div>
          )}
        </section>

        {/* ── Right: what makes the paper, and what releases it ── */}
        <div className="assessor-stack gen-side">
          <section className="assessor-card">
            <h2 className="assessor-card-title">Assessment</h2>

            <div className="gen-field">
              <span className="field-label">Type</span>
              <div className="gen-toggle" role="group" aria-label="Assessment type">
                <button
                  type="button"
                  className={`gen-toggle__btn${scope === "lesson" ? " is-active" : ""}`}
                  onClick={() => setScope("lesson")}
                >
                  Lesson quiz
                </button>
                <button
                  type="button"
                  className={`gen-toggle__btn${scope === "final" ? " is-active" : ""}`}
                  onClick={() => setScope("final")}
                >
                  Final exam
                </button>
              </div>
            </div>

            {scope === "lesson" ? (
              <div className="gen-field">
                <span className="field-label">Lesson</span>
                {/* Each lesson says on its own line whether its paper is
                    already out, which is the thing that decides whether
                    generating over it is a new paper or a replacement. */}
                <AssessorSelect
                  label="Lesson"
                  value={moduleId}
                  onChange={setModuleId}
                  options={lessons.map((row) => ({
                    value: row.moduleId,
                    label: `${row.n}. ${row.title}`,
                    meta: row.assessment
                      ? row.assessment.status === "posted"
                        ? "Posted"
                        : "Draft"
                      : undefined
                  }))}
                />
                {/* The generator reads the extracted text, so a lesson without
                    it is worth saying before the button is pressed rather than
                    after the call comes back empty. */}
                {lesson && !lesson.hasText ? (
                  <span className="gen-hint is-warn">This lesson has no extracted text yet.</span>
                ) : null}
              </div>
            ) : null}

            <label className="gen-field">
              <span className="field-label">Number of questions</span>
              <input
                type="number"
                className="gen-input"
                min={1}
                max={120}
                value={itemCount}
                onChange={(event) => setItemCount(event.target.value)}
              />
            </label>

            {/* The assessor's own figure first, and the department's under it.
                Unticking the box is how the default is given up, so it reads
                as a note on the field above rather than as the field itself. */}
            <div className="gen-field">
              {/* Shown either way, so the pair does not jump about as the box
                  is ticked. While the default is in force it is the default
                  being displayed, not a field waiting to be filled in — which
                  is what the disabled state says. */}
              <label className={`gen-field gen-field--inline${timed ? " is-off" : ""}`}>
                <span className="field-label">Minutes</span>
                <input
                  type="number"
                  className="gen-input"
                  min={0}
                  max={600}
                  value={minutes}
                  disabled={timed}
                  onChange={(event) => setMinutes(event.target.value)}
                />
              </label>

              <label className="gen-check">
                <input
                  type="checkbox"
                  checked={timed}
                  onChange={(event) => {
                    setTimed(event.target.checked);
                    if (event.target.checked) setMinutes(DEFAULT_MINUTES);
                  }}
                />
                <span>
                  <ClockIcon size={13} /> {DEFAULT_MINUTES} minutes (default)
                </span>
              </label>
            </div>

            {/* Assembling a final is free — it draws on questions that already
                exist — so only a lesson quiz has to be asked about. */}
            {confirming ? (
              <>
                <p className="gen-hint is-warn">
                  {paper
                    ? "This calls the AI and costs money. The questions below are replaced, and the assessment goes back to a draft."
                    : "This calls the AI and costs money."}
                </p>
                <div className="gen-actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn btn--primary" onClick={generate}>
                    <GenerateIcon size={16} />
                    Yes, generate
                  </button>
                </div>
              </>
            ) : (
              <div className="gen-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={
                    Boolean(busy) ||
                    frozen ||
                    (scope === "lesson" && (!moduleId || !lesson?.hasText))
                  }
                  onClick={scope === "final" ? generate : () => setConfirming(true)}
                >
                  <GenerateIcon size={16} />
                  {busy === "generate" ? "Generating…" : paper ? "Regenerate" : "Generate"}
                </button>

                {paper && !frozen ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={Boolean(busy)}
                    onClick={applySettings}
                  >
                    {busy === "settings" ? "Applying…" : "Update time limit"}
                  </button>
                ) : null}
              </div>
            )}

            {locked ? (
              <p className="gen-hint is-warn">
                {handedIn} student{handedIn === 1 ? " has" : "s have"} already taken this
                assessment, so its questions can no longer be changed.
              </p>
            ) : null}
          </section>

          <section className="assessor-card gen-post">
            <h2 className="assessor-card-title">Review &amp; post</h2>

            {items.length > 0 ? (
              <>
                <span className="field-label">Correct a question</span>
                <div className="gen-numbers">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`gen-number${editingId === item.id ? " is-active" : ""}`}
                      onClick={() => openQuestion(item)}
                      disabled={frozen}
                      title={item.q}
                    >
                      {item.n}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="gen-hint">Nothing to correct yet.</p>
            )}

            <div className="gen-divider" />

            <div className="gen-actions">
              {posted ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={Boolean(busy) || locked}
                  onClick={unpost}
                >
                  {busy === "unpost" ? "Unposting…" : "Unpost"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={Boolean(busy) || !paper || items.length === 0 || Boolean(closed)}
                  onClick={post}
                >
                  <CheckIcon size={15} />
                  {busy === "post" ? "Posting…" : "Post Assessment"}
                </button>
              )}
            </div>

            {/* Read off the overview rather than the loaded paper: posting
                does not refetch the questions, so the paper in hand still says
                draft a moment after the course has it. */}
            {posted && target?.postedAt ? (
              <p className="gen-hint">
                Posted {new Date(target.postedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                })}
                {target.postedBy ? ` by ${target.postedBy}` : ""}.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}

export default GenerateCoursePage;
