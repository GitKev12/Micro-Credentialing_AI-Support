import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCourseTos, saveCourseTos, storedAssessorId } from "../../../../services/assessors";
import { AssessorSelect, LoadFailed, Segmented } from "../ui";
import { SkeletonText } from "../../../../components/Skeleton";
import { noticeClass, useNotice } from "../../../../lib/useNotice";
import AllocationBar from "./AllocationBar";
import ContentSplit from "./ContentSplit";
import LevelSplit from "./LevelSplit";
import Matrix from "./Matrix";
import Stepper from "./Stepper";
import {
  LEVEL_KEYS,
  apportion,
  autoFill,
  columnTotals,
  emptySplit,
  splitItems,
  toCount
} from "./levels";

/**
 * The Table of Specification, written by the assessor who will generate from it.
 *
 * A blueprint is not a record of anything — it is an instruction, and the only
 * person who can give it is the one who knows what the course is for. That is
 * why it sits here rather than in the admin console, and why it is built
 * rather than tabulated: the admin screen was a grid of empty cells that told
 * you what you had just typed into it, and this one is a length of paper being
 * spent.
 *
 * Two blueprints, because there are two kinds of paper:
 *
 *   A lesson quiz covers one lesson, so there is no content to distribute —
 *   all of it is that lesson. It needs a length and a split across the six
 *   levels of thinking, and nothing else.
 *
 *   A final exam draws on every lesson, so it needs both: how much of the
 *   paper each lesson carries, what thinking the paper as a whole demands, and
 *   then the matrix where those two answers meet.
 *
 * It is opened over the generate screen rather than reached from the rail,
 * because writing the blueprint and spending it are one task: the assessor is
 * already looking at the course, the lesson and the count when they find that
 * the plan behind those numbers needs changing.
 *
 * Nothing here calls a model or costs anything. It is the sentence generation
 * will be given — how many questions, from where, at what level — written down
 * before any money is spent on it.
 */

const MAX_ITEMS = 120;
const DEFAULT_FINAL_ITEMS = 40;

/* ───────────────────────────── The blueprint ───────────────────────────── */

/** The stored document, turned into the two things this screen edits. */
function readTos(tos, lessons) {
  const quizRows = new Map(
    (tos?.rows ?? []).filter((row) => row.moduleId).map((row) => [String(row.moduleId), row])
  );
  const quizzes = Object.fromEntries(
    lessons.map((lesson) => [
      lesson.id,
      Object.fromEntries(
        LEVEL_KEYS.map((key) => [key, toCount(quizRows.get(String(lesson.id))?.[key])])
      )
    ])
  );

  const finalRows = new Map(
    (tos?.final?.rows ?? []).filter((row) => row.moduleId).map((row) => [String(row.moduleId), row])
  );
  const grid = lessons.map((lesson) =>
    Object.fromEntries(
      LEVEL_KEYS.map((key) => [key, toCount(finalRows.get(String(lesson.id))?.[key])])
    )
  );

  // A stored row states its own share of the paper. A document written before
  // the final had a blueprint of its own has no share to state, so the row's
  // own cells stand in — which for an empty grid is nothing, the honest
  // reading of a blueprint nobody has written yet.
  const content = Object.fromEntries(
    lessons.map((lesson, index) => [
      lesson.id,
      toCount(finalRows.get(String(lesson.id))?.target) || splitItems(grid[index])
    ])
  );

  const stored = tos?.final?.levels;
  const levels = stored
    ? Object.fromEntries(LEVEL_KEYS.map((key) => [key, toCount(stored[key])]))
    : columnTotals(grid);

  const shares = Object.values(content).reduce((sum, value) => sum + value, 0);

  return {
    quizzes,
    finalItems: toCount(tos?.final?.items) || shares || DEFAULT_FINAL_ITEMS,
    content,
    levels,
    grid
  };
}

function TosEditor({ courseId, defaultMode, defaultLesson, headerEnd, onSaved }) {
  const assessorId = storedAssessorId();

  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useNotice();
  const [saving, setSaving] = useState(false);

  // Opened from the generate screen, so it opens on the paper that screen is
  // pointed at — the assessor came here about that one.
  const [mode, setMode] = useState(defaultMode ?? "lesson");
  const [lessonId, setLessonId] = useState(defaultLesson ?? "");
  const [draft, setDraft] = useState(null);

  /* ── Loading ──────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!courseId || !assessorId) return;
    setFailed(false);

    try {
      const payload = await fetchCourseTos(assessorId, courseId);
      setData(payload);
      setDraft(readTos(payload.tos, payload.lessons ?? []));
      setLessonId((current) => current || payload.lessons?.[0]?.id || "");
    } catch (_error) {
      setFailed(true);
    }
  }, [assessorId, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const lessons = data?.lessons ?? [];
  const course = data?.course ?? null;

  const contentTotal = useMemo(
    () => lessons.reduce((sum, lesson) => sum + (draft?.content?.[lesson.id] ?? 0), 0),
    [lessons, draft]
  );

  /* ── Editing ──────────────────────────────────────────────────────────── */

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const quizSplit = draft?.quizzes?.[lessonId] ?? emptySplit();
  const quizItems = splitItems(quizSplit);

  const setQuizLevel = (key, value) =>
    setDraft((current) => ({
      ...current,
      quizzes: {
        ...current.quizzes,
        [lessonId]: { ...current.quizzes[lessonId], [key]: value }
      }
    }));

  /**
   * Retargeting a quiz keeps the mix it already has.
   *
   * Changing 10 items to 20 and being handed a blank split would throw away
   * the decision the assessor came here to make, so the existing proportions
   * are re-apportioned instead: a 1/2/3/4 paper doubles to 2/4/6/8 rather than
   * emptying. With nothing set yet there is nothing to keep, and the levels
   * stay at zero for the assessor to place.
   */
  const setQuizItems = (next) =>
    setDraft((current) => {
      const split = current.quizzes[lessonId] ?? emptySplit();
      const spread = apportion(next, LEVEL_KEYS.map((key) => split[key]));

      return {
        ...current,
        quizzes: {
          ...current.quizzes,
          [lessonId]: Object.fromEntries(LEVEL_KEYS.map((key, index) => [key, spread[index]]))
        }
      };
    });

  const setContent = (id, value) => patch({ content: { ...draft.content, [id]: value } });

  const spreadEvenly = () => {
    const shares = apportion(draft.finalItems, lessons.map(() => 1));
    patch({
      content: Object.fromEntries(lessons.map((lesson, index) => [lesson.id, shares[index]]))
    });
  };

  const setFinalLevel = (key, value) => patch({ levels: { ...draft.levels, [key]: value } });

  const setCell = (index, key, value) =>
    setDraft((current) => ({
      ...current,
      grid: current.grid.map((row, at) => (at === index ? { ...row, [key]: value } : row))
    }));

  const buildMatrix = () =>
    patch({
      grid: autoFill(
        lessons.map((lesson) => draft.content[lesson.id] ?? 0),
        draft.levels
      )
    });

  /* ── Saving ───────────────────────────────────────────────────────────── */

  const save = async () => {
    setSaving(true);
    try {
      const payload = await saveCourseTos(assessorId, courseId, {
        rows: lessons.map((lesson) => ({
          moduleId: lesson.id,
          course: lesson.title,
          ...draft.quizzes[lesson.id]
        })),
        final: {
          items: draft.finalItems,
          levels: draft.levels,
          rows: lessons.map((lesson, index) => ({
            moduleId: lesson.id,
            coverage: lesson.title,
            target: draft.content[lesson.id] ?? 0,
            ...draft.grid[index]
          }))
        }
      });
      setData((current) => ({ ...current, tos: payload.tos }));
      setNotice({ tone: "ok", text: "Blueprint saved." });
      onSaved?.(payload.tos);
    } catch (_error) {
      setNotice({ tone: "bad", text: "That did not save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  /* ── Views ────────────────────────────────────────────────────────────── */

  if (failed) {
    return (
      <div className="tos-editor">
        <LoadFailed what="this blueprint" onRetry={load} />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="tos-editor">
        <SkeletonText lines={6} label="Loading the blueprint…" />
      </div>
    );
  }

  const gridTotal = draft.grid.reduce((sum, row) => sum + splitItems(row), 0);

  return (
    <div className="tos-editor assessor-stack">
      {/* The dialog's only chrome is the close control the frame hands in, so
          that the blueprint keeps one header rather than gaining a second. */}
      <header className="tos-editor__head">
        <div className="tos-editor__lead">
          {course ? (
            <div className="assessor-eyebrow">
              {course.code}
              {course.section ? ` · ${course.section}` : ""}
            </div>
          ) : null}
          <h2 className="tos-editor__title">Table of Specification</h2>
        </div>
        <div className="tos-editor__actions">
          <button type="button" className="btn btn--primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save blueprint"}
          </button>
          {headerEnd}
        </div>
      </header>

      {notice ? <p className={noticeClass(notice)}>{notice.text}</p> : null}

      <Segmented
        label="Which paper"
        value={mode}
        onChange={setMode}
        options={[
          { key: "lesson", label: "Lesson quiz" },
          { key: "final", label: "Final exam" }
        ]}
      />

      {mode === "lesson" ? (
        <>
          <section className="assessor-card tos-block">
            <div className="tos-block__head">
              <h2 className="tos-block__title">The quiz</h2>
              <div className="tos-block__tools">
                <AssessorSelect
                  value={lessonId}
                  onChange={setLessonId}
                  label="Lesson"
                  options={lessons.map((entry) => ({ value: entry.id, label: entry.title }))}
                />
                <Stepper
                  value={quizItems}
                  max={MAX_ITEMS}
                  label="Questions in this quiz"
                  onChange={setQuizItems}
                />
              </div>
            </div>

            <AllocationBar target={quizItems} split={quizSplit} />

            <LevelSplit split={quizSplit} total={quizItems} onChange={setQuizLevel} />
          </section>

          <section className="assessor-card tos-block">
            <h2 className="tos-block__title">Every lesson</h2>
            <ul className="tos-rows tos-rows--compact">
              {lessons.map((entry, index) => {
                const items = splitItems(draft.quizzes[entry.id] ?? {});
                const current = String(entry.id) === String(lessonId);

                return (
                  <li className={`tos-row${current ? " is-current" : ""}`} key={entry.id}>
                    <span className="tos-row__n">{index + 1}</span>
                    <button
                      type="button"
                      className="tos-row__pick"
                      onClick={() => setLessonId(entry.id)}
                    >
                      {entry.title}
                    </button>
                    <span className={`tos-row__items${items ? "" : " is-empty"}`}>
                      {items ? `${items} questions` : "Not set"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <>
          <section className="assessor-card tos-block">
            <div className="tos-block__head">
              <h2 className="tos-block__title">The exam</h2>
              <div className="tos-block__tools">
                <Stepper
                  value={draft.finalItems}
                  max={MAX_ITEMS}
                  label="Questions in the final exam"
                  onChange={(next) => patch({ finalItems: next })}
                />
              </div>
            </div>

            <AllocationBar target={draft.finalItems} split={draft.levels} />
          </section>

          <section className="assessor-card tos-block">
            <div className="tos-block__head">
              <h2 className="tos-block__title">Where the questions come from</h2>
              <button type="button" className="btn btn--ghost" onClick={spreadEvenly}>
                Spread evenly
              </button>
            </div>
            <ContentSplit
              lessons={lessons}
              counts={draft.content}
              total={draft.finalItems}
              onChange={setContent}
            />
            <p className={`tos-check${contentTotal === draft.finalItems ? " is-ok" : ""}`}>
              {contentTotal === draft.finalItems
                ? `All ${draft.finalItems} questions are accounted for.`
                : `The lessons add up to ${contentTotal}, and the exam is ${draft.finalItems}.`}
            </p>
          </section>

          <section className="assessor-card tos-block">
            <h2 className="tos-block__title">What thinking they ask for</h2>
            <LevelSplit split={draft.levels} total={draft.finalItems} onChange={setFinalLevel} />
          </section>

          <section className="assessor-card tos-block">
            <div className="tos-block__head">
              <h2 className="tos-block__title">Lesson against level</h2>
              <button type="button" className="btn btn--ghost" onClick={buildMatrix}>
                Fill from the splits
              </button>
            </div>
            <Matrix
              lessons={lessons}
              rows={draft.grid}
              rowTargets={draft.content}
              colTargets={draft.levels}
              onCell={setCell}
            />
            <p className={`tos-check${gridTotal === draft.finalItems ? " is-ok" : ""}`}>
              {gridTotal === draft.finalItems
                ? "The matrix matches the exam."
                : `The matrix holds ${gridTotal} questions, and the exam is ${draft.finalItems}.`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default TosEditor;
