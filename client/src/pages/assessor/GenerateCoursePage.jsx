import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchCourseAssessment,
  fetchCourseAssessments,
  fetchCourseTos,
  generateCourseAssessment,
  postCourseAssessment,
  storedAssessorId,
  unpostCourseAssessment,
  updateCourseAssessment
} from "../../services/assessors";
import { CheckIcon, ClockIcon, GenerateIcon, PencilIcon } from "./components/icons";
import { AssessorSelect, Chip, ChoiceLetter, ScreenHeader, choiceLetter } from "./components/ui";
import { useGlidingPill } from "../../hooks/useGlidingPill";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import CodeBlock from "../../components/CodeBlock";
import { noticeClass, useNotice } from "../../lib/useNotice";
import { DEFAULT_MINUTES, TIMED, UNTIMED, limitModeFor, limitReady, timeLimitFor } from "./timeLimit";
import QuestionsField from "./components/tos/QuestionsField";
import TosModal from "./components/tos/TosModal";
import { DEFAULT_FINAL_ITEMS, LEVEL_KEYS, splitItems, toCount } from "./components/tos/levels";
import LevelChip from "./components/tos/LevelChip";

/**
 * Generating one course's papers.
 *
 * Two things happen on this screen, and they are laid out in the order they
 * happen in. The questions and their answers fill the left, because reading
 * them is the work; the two cards on the right are what produces and releases
 * them.
 *
 *   Assessment    — quiz or final, which lesson, how long the attempt runs,
 *                   and what the Table of Specification sets for the paper:
 *                   how many questions and their mix. Changing the count
 *                   means changing the plan, which opens over this screen.
 *                   Generating reads the lesson's extracted text and writes
 *                   a draft.
 *   Review & post — pick a question by its number to correct it, then post.
 *                   Posting applies to the whole class at once: an Assessment
 *                   holds no student, so there is nothing per-student to set.
 *
 * A draft is invisible to students until it is posted. That is the point of the
 * screen — a wrong answer key found here is found before a class takes it.
 */

/* What the Lesson field reads on a final, which is drawn from all of them.
   Never sent anywhere: the field is disabled, and a final carries no lesson. */
const EVERY_LESSON = "all";

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
  const [code, setCode] = useState(item.code ?? "");
  const [choices, setChoices] = useState(item.choices);
  const [key, setKey] = useState(item.key);
  // A question written without a snippet is most of them, so the box is not
  // stood in every form waiting to be ignored — it is offered.
  const [codeOpen, setCodeOpen] = useState(Boolean(item.code));

  // Reopening a question, or a fresh generation landing under it, starts the
  // form from what is actually stored rather than from the last edit.
  useEffect(() => {
    setText(item.q);
    setCode(item.code ?? "");
    setChoices(item.choices);
    setKey(item.key);
    setCodeOpen(Boolean(item.code));
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
          <LevelChip level={item.level} />
          {readOnly ? null : (
            <button type="button" className="gen-q__edit" onClick={onEdit}>
              <PencilIcon size={14} />
              Edit
            </button>
          )}
        </div>

        <CodeBlock code={item.code} className="gen-q__code" />

        <ul className="choice-list">
          {item.choices.map((choice, index) => (
            <li key={choice.id} className={`choice${choice.id === item.key ? " is-key" : ""}`}>
              <ChoiceLetter index={index} />
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
        {/* Stays while the question is being corrected: the level is what the
            correction is being judged against. */}
        <LevelChip level={item.level} />
      </div>

      {/* The snippet, editable — and, more to the point, on screen at all. The
          form used to leave it out altogether, so a question reading "what
          does line 4 print?" was corrected with line 4 nowhere in front of the
          assessor, and a snippet with the bug in it could only be fixed by
          regenerating the whole paper.

          Clearing the box removes the snippet. That is what the server reads a
          present-but-empty code as, and it is the only way a question that no
          longer needs one gets rid of it. */}
      {codeOpen ? (
        <textarea
          className="gen-input gen-input--code"
          value={code}
          rows={Math.min(20, Math.max(4, code.split("\n").length))}
          wrap="off"
          spellCheck={false}
          aria-label={`Code for question ${item.n}`}
          onChange={(event) => setCode(event.target.value)}
        />
      ) : (
        <button
          type="button"
          className="btn btn--ghost btn--sm gen-q__add-code"
          onClick={() => setCodeOpen(true)}
        >
          Add code
        </button>
      )}

      {/* The radio is the answer key. Marking the right option is the whole
          reason this form exists — a generated question whose stated answer is
          wrong would otherwise mark a whole class wrong. */}
      <ul className="choice-list">
        {choices.map((choice, index) => (
          <li key={choice.id} className={`choice${choice.id === key ? " is-key" : ""}`}>
            <label className="gen-q__radio">
              <input
                type="radio"
                name={`key-${item.id}`}
                checked={choice.id === key}
                onChange={() => setKey(choice.id)}
              />
              <span className="assessor-sr-only">Mark {choiceLetter(index)} as the correct answer</span>
            </label>
            <ChoiceLetter index={index} />
            <input
              type="text"
              className="gen-input"
              value={choice.text}
              aria-label={`Choice ${choiceLetter(index)}`}
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
          onClick={() => onSave({ id: item.id, q: text.trim(), code, choices, key })}
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
  const { pillRef: typePillRef, pillStyle: typePillStyle } = useGlidingPill(".gen-toggle__btn.is-active", [scope]);
  const [moduleId, setModuleId] = useState("");
  const [limit, setLimit] = useState(UNTIMED);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);

  const [paper, setPaper] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState("");
  // Three seconds and it fades, like every other console's — see useNotice.
  // The `closed` line below it is not one of these: a course whose run is over
  // stays over, and that banner has to stay with it.
  const [notice, setNotice] = useNotice();
  // What the paper the model just wrote does not cover: a lesson with no text
  // to write from, or one it came up short on. Belongs to the last generation
  // and nothing else, so it is cleared wherever that paper stops being what is
  // on screen.
  const [gaps, setGaps] = useState([]);
  // Generating spends money, so it asks first rather than firing on the click
  // that reaches it. A final spends the most of all — one call per lesson.
  const [confirming, setConfirming] = useState(false);

  // The blueprint, read for the card beside the fields it governs and written
  // in the dialog that card opens.
  const [tos, setTos] = useState(null);
  const [tosOpen, setTosOpen] = useState(false);

  /**
   * Whose papers these are.
   *
   * A paper is written for a class, so this screen is always looking at one.
   * Empty until the first read answers with it — the server picks the
   * assessor's own class, and there is nothing to choose on a course they
   * teach a single class of. Where they teach two, changing this is changing
   * which class's papers are on screen, so everything reloads with it.
   */
  const [classId, setClassId] = useState("");

  const reload = useCallback(async () => {
    if (!assessorId || !courseId) return null;
    const data = await fetchCourseAssessments(assessorId, courseId, classId || null);
    setOverview(data);
    // The server's answer settles it on the first read, and agrees with the
    // choice on every one after.
    if (data?.classId) setClassId(String(data.classId));
    return data;
  }, [assessorId, courseId, classId]);

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

  // Separately from the overview: a course with no blueprint yet is a normal
  // state, not a failure, and the rest of the screen works without one.
  useEffect(() => {
    if (!assessorId || !courseId) return undefined;

    let active = true;
    fetchCourseTos(assessorId, courseId)
      .then((payload) => {
        if (active) setTos(payload?.tos ?? null);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [assessorId, courseId]);

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
    setGaps([]);

    if (!target?.id) {
      setPaper(null);
      setEditingId(null);
      return undefined;
    }

    fetchCourseAssessment(assessorId, courseId, target.id, classId || null)
      .then((loaded) => {
        if (!active) return;
        setPaper(loaded);
        setEditingId(null);
        setLimit(limitModeFor(loaded?.timeLimitMinutes));
        setMinutes(loaded?.timeLimitMinutes ?? DEFAULT_MINUTES);
      })
      .catch(() => {
        if (active) setPaper(null);
      });

    return () => {
      active = false;
    };
  }, [assessorId, courseId, target?.id, classId]);

  // A final runs an hour and a half unless someone says otherwise; a quiz is
  // untimed unless someone says otherwise. Only applied where there is no paper to read it off.
  useEffect(() => {
    if (target?.id) return;
    setPaper(null);
    setLimit(scope === "final" ? TIMED : UNTIMED);
    setMinutes(DEFAULT_MINUTES);
  }, [scope, moduleId, target?.id]);

  const students = course?.students ?? 0;
  // The classes this assessor teaches the course through. One of them needs no
  // choosing; two means every paper on screen belongs to one of them, and the
  // assessor says which.
  const classes = overview?.classes ?? [];
  const className = classes.find((cls) => String(cls.id) === String(classId))?.name ?? "";
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

  /**
   * The blueprint for the paper the fields are pointed at.
   *
   * A final reads its own block; a quiz reads the row for the lesson picked
   * above. They are different plans and the card must not show one while the
   * assessor is generating the other.
   */
  const brief = useMemo(() => {
    if (scope === "final") {
      const split = tos?.final?.levels ?? {};
      const assigned = splitItems(split);
      const stated = toCount(tos?.final?.items);
      return {
        split,
        items: stated && stated !== 40 ? stated : assigned || DEFAULT_FINAL_ITEMS
      };
    }

    const row = (tos?.rows ?? []).find((entry) => String(entry.moduleId) === String(moduleId));
    const split = Object.fromEntries(LEVEL_KEYS.map((key) => [key, toCount(row?.[key])]));
    return { split, items: splitItems(split) };
  }, [tos, scope, moduleId]);

  // One source of truth for a paper's length. The generate screen used to
  // offer a second number and then tell the assessor when it disagreed with
  // the blueprint. A count belongs to the Table of Specification, so nothing
  // here can override it: no plan means there is no paper to write.
  const length = brief.items;

  // What the confirmation names as the material. A quiz is written from the
  // one lesson picked above; a final is written from every lesson the
  // examination's table gives a share to.
  const source =
    scope === "final"
      ? "every lesson in the course"
      : (lesson?.title ?? "this lesson");

  const requestedMinutes = timeLimitFor({ mode: limit, minutes });
  // Timed with an empty field is the one answer that is not yet an answer.
  const limitSet = limitReady({ mode: limit, minutes });

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
        itemCount: length,
        timeLimitMinutes: requestedMinutes,
        classId: classId || null
      });

      if (result.assessment) {
        setPaper(result.assessment);
        setEditingId(null);

        // A final is written lesson by lesson, and two things can go quiet on
        // the way: a lesson with no readable text, and a lesson the model came
        // up short on. Either changes what the examination covers, and neither
        // shows in a paper you would have to count by lesson to find them.
        //
        // Kept beside the paper rather than in the notice, because a notice
        // takes itself away after three seconds and this is the assessor's to
        // decide about — whether the examination can stand with a lesson
        // missing from it.
        setGaps([
          ...(result.unassessedLessons ?? []).map((title) => `${title} — no lesson text to write from`),
          ...(result.shortfall ?? []).map(
            (row) => `${row.topic} — ${row.written} of the ${row.asked} asked for`
          )
        ]);

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
        timeLimitMinutes: requestedMinutes,
        classId: classId || null
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
        items: [patch],
        classId: classId || null
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
      const result = await postCourseAssessment(assessorId, courseId, paper.id, classId || null);
      if (result.assessment) {
        setNotice({
          tone: "ok",
          text: `Posted to ${students} student${students === 1 ? "" : "s"} in ${className || "this course"}.`
        });
        await reload();
      }
      return result;
    });

  const unpost = () =>
    run("unpost", async () => {
      const result = await unpostCourseAssessment(assessorId, courseId, paper.id, classId || null);
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
                {paper?.title || (scope === "final" ? "Final assessment" : "Quiz")}
              </h2>
              <p className="assessor-meta" style={{ marginTop: "var(--sp-1)" }}>
                {paper
                  ? `${paper.itemCount} questions · ${paper.totalPoints} points · pass mark ${paper.passMark}`
                  : "Nothing written for this assessment yet."}
              </p>

              {/* The lessons this paper does not measure, and how far short it
                  fell on each. Stays until the paper does. */}
              {gaps.length > 0 ? (
                <ul className="gen-gaps" role="status">
                  {gaps.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="gen-paper__tags">
              {paper ? (
                <Chip tone={posted ? "success" : "brand-soft"} dot>
                  {posted ? "Posted" : "Draft"}
                </Chip>
              ) : null}
              {/* An untimed paper says so. With no chip at all it read the
                  same as a paper whose length had not loaded yet, and now
                  that no limit is an answer somebody chooses it is worth
                  seeing chosen. */}
              {paper ? (
                <Chip tone="neutral">
                  {paper.timeLimitMinutes ? (
                    <>
                      <ClockIcon size={13} />
                      {paper.timeLimitMinutes} min
                    </>
                  ) : (
                    "Untimed"
                  )}
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

          {/* While the model writes, the sheet shows a paper's bones: rows
              shaped like the question cards they become, and nothing of a real
              question, because there is not a question yet. A row says the
              write is in flight without pretending the work is further along
              than it is, and it lets the questions in without the column
              jumping up to meet them. */}
          {busy === "generate" ? (
            <div className="gen-paper-skel" role="status" aria-live="polite">
              <span className="assessor-sr-only">Writing the paper</span>
              <p className="gen-hint">Writing questions…</p>
              <ol className="gen-skel-list" aria-hidden="true">
                {Array.from({ length: 3 }, (_, block) => (
                  <li key={block} className="gen-skel">
                    <span className="gen-skel__num">
                      <Skeleton h={20} circle />
                    </span>
                    <div className="gen-skel__body">
                      <Skeleton w="86%" h={11} />
                      <Skeleton w="94%" h={9} />
                      <Skeleton className="gen-skel__code" w="100%" h={68} />
                      <div className="gen-skel__choices">
                        {[62, 48, 70, 54].map((width, choice) => (
                          <Skeleton
                            key={choice}
                            className="gen-skel__choice"
                            w={`${width}%`}
                            h={13}
                          />
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : items.length > 0 ? (
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

            {/* Whose papers these are. Only where there is a choice to make:
                on a course taught through one class the answer is the class,
                and a field with a single option is furniture. */}
            {classes.length > 1 ? (
              <div className="gen-field">
                <span className="field-label">Class</span>
                <AssessorSelect
                  label="Class"
                  value={classId}
                  onChange={setClassId}
                  options={classes.map((cls) => ({
                    value: cls.id,
                    label: cls.name,
                    meta: `${cls.students} student${cls.students === 1 ? "" : "s"}`
                  }))}
                />
              </div>
            ) : null}

            <div className="gen-field">
              <span className="field-label">Type</span>
              <div className="gen-toggle" role="group" aria-label="Assessment type" ref={typePillRef}>
                <span className="gen-toggle__pill" style={typePillStyle} aria-hidden="true" />
                <button
                  type="button"
                  className={`gen-toggle__btn${scope === "lesson" ? " is-active" : ""}`}
                  onClick={() => setScope("lesson")}
                >
                  Quiz
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

            {/* Standing here in both types, so the panel keeps its height as the
                type is toggled — the same reason the Minutes field below is
                shown while the default is in force rather than swapped out.
                Dropping it moved every control under it up by a field, and the
                paper beside it with them.

                A final is not drawn from one lesson but from all of them,
                which is what it says while it cannot be used. */}
            <div className="gen-field">
              <span className="field-label">Lesson</span>
              {scope === "lesson" ? (
                <>
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
                </>
              ) : (
                <AssessorSelect
                  label="Lesson"
                  value={EVERY_LESSON}
                  onChange={() => {}}
                  options={[{ value: EVERY_LESSON, label: "Every lesson" }]}
                  disabled
                />
              )}
            </div>

            <QuestionsField
              count={length}
              split={brief.split}
              paper={scope === "final" ? "final exam" : "quiz"}
              onModify={() => setTosOpen(true)}
            />

            {/* Whether a paper runs to a clock is on or off, so it is a switch.
                It used to be a tickbox carrying the department's ninety
                minutes beside a Minutes field carrying the assessor's own, and
                a paper with no clock at all had no control of its own — you
                reached it by unticking the box and typing nought. The most
                permissive setting a paper has was the one nobody could find.
                Here it is the word the switch shows when it is off.

                Ninety is what the Minutes field opens on for a final. A
                starting figure, not a second answer competing with the
                assessor's own. */}
            <div className="gen-field">
              <span className="field-label" id="gen-limit-label">
                Time limit
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={limit === TIMED}
                /* Named by the field's own label, so what is read out is
                   "Time limit, on" rather than the state word twice. */
                aria-labelledby="gen-limit-label"
                className={`gen-switch${limit === TIMED ? " is-on" : ""}`}
                onClick={() => setLimit(limit === TIMED ? UNTIMED : TIMED)}
              >
                <span>{limit === TIMED ? "Timed" : "No time limit"}</span>
                <span className="gen-switch__track">
                  <span className="gen-switch__thumb" />
                </span>
              </button>
            </div>

            {/* Only while there is a clock to set. A field that cannot apply to
                the paper is a question the assessor has to work out the answer
                is "nothing" to. */}
            {limit === TIMED ? (
              <div className="gen-field">
                <label className="field-label" htmlFor="gen-minutes">
                  Minutes
                </label>
                <input
                  id="gen-minutes"
                  type="number"
                  className="gen-input"
                  min={1}
                  max={600}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                />
                {/* An empty field would save an untimed paper, which is not
                    what the switch above says. Says what to do next rather
                    than what is wrong. */}
                {limitSet ? null : (
                  <span className="gen-hint is-warn">
                    Enter a length, or turn the time limit off.
                  </span>
                )}
              </div>
            ) : null}

            {/* A final used to go straight through on the click that reached
                it: assembling one drew on questions that already existed and
                took nothing from the outside, so there was nothing to stop and
                check. It is written by the model now, one call per lesson —
                the most expensive press on the console — and it asks like
                every other.

                Asked as a question, and naming what is about to be written:
                how many questions, and off which lesson. That is the thing
                worth catching at this press — the wrong lesson still picked,
                or a count left at somebody else's figure — and it is read off
                the fields above, so what the sentence says is what gets sent.
                A replacement adds what it undoes and is the only one of the two
                that warns; a first write has nothing to lose and just asks. */}
            {confirming ? (
              <>
                <p className={`gen-hint${paper ? " is-warn" : ""}`}>
                  {paper
                    ? `Replace all ${paper.itemCount} questions with ${length} new ones written from ${source}? The assessment goes back to a draft.`
                    : `Write ${length} questions from ${source}?`}
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
                    length === 0 ||
                    !limitSet ||
                    (scope === "lesson" && (!moduleId || !lesson?.hasText))
                  }
                  onClick={() => setConfirming(true)}
                >
                  <GenerateIcon size={16} />
                  {busy === "generate" ? "Generating…" : paper ? "Regenerate" : "Generate"}
                </button>

                {paper && !frozen ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={Boolean(busy) || !limitSet}
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

      {tosOpen ? (
        <TosModal
          courseId={courseId}
          mode={scope === "final" ? "final" : "lesson"}
          lessonId={scope === "final" ? "" : moduleId}
          onSaved={setTos}
          onClose={() => setTosOpen(false)}
        />
      ) : null}
    </>
  );
}

export default GenerateCoursePage;
