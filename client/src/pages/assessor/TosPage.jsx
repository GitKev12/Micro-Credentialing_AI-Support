import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchAssessorClasses,
  fetchCourseTos,
  saveCourseTos,
  storedAssessorId
} from "../../services/assessors";
import { ChevronRightIcon } from "./components/icons";
import { AssessorSelect, LoadFailed, ScreenHeader, Segmented } from "./components/ui";
import { SkeletonText } from "../../components/Skeleton";
import { noticeClass, useNotice } from "../../lib/useNotice";
import AllocationBar from "./components/tos/AllocationBar";
import ContentSplit from "./components/tos/ContentSplit";
import LevelSplit from "./components/tos/LevelSplit";
import Matrix from "./components/tos/Matrix";
import Stepper from "./components/tos/Stepper";
import {
  LEVEL_KEYS,
  apportion,
  autoFill,
  columnTotals,
  emptySplit,
  splitItems,
  toCount
} from "./components/tos/levels";

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
 * Nothing here calls a model or costs anything. It is the sentence generation
 * will be given — how many questions, from where, at what level — written down
 * before any money is spent on it.
 */

const MAX_ITEMS = 120;
const DEFAULT_FINAL_ITEMS = 40;

/* ───────────────────────────── Picking a class ───────────────────────────── */

function ClassPicker({ classes, onOpen }) {
  if (classes.length === 0) {
    return <p className="gen-empty__title">You are not assigned to a class yet.</p>;
  }

  return (
    <ul className="tos-picker">
      {classes.map((course) => (
        <li key={course.id}>
          <button type="button" className="tos-picker__card" onClick={() => onOpen(course.id)}>
            <span className="tos-picker__code">
              {course.code}
              {course.section ? ` · ${course.section}` : ""}
            </span>
            <span className="tos-picker__name">{course.title}</span>
            <span className="tos-picker__go">
              Open blueprint
              <ChevronRightIcon size={15} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────── The screen ─────────────────────────────── */

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

function TosPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const assessorId = storedAssessorId();

  const [classes, setClasses] = useState(null);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useNotice();
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState("lesson");
  const [lessonId, setLessonId] = useState("");
  const [draft, setDraft] = useState(null);

  /* ── Loading ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (courseId || !assessorId) return undefined;

    let active = true;
    fetchAssessorClasses(assessorId)
      .then((list) => {
        if (active) setClasses(list);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [assessorId, courseId]);

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
    } catch (_error) {
      setNotice({ tone: "bad", text: "That did not save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  /* ── Views ────────────────────────────────────────────────────────────── */

  if (!courseId) {
    return (
      <div className="assessor-body assessor-stack">
        <ScreenHeader eyebrow="Blueprints" title="Table of Specification" />
        <p className="tos-note tos-note--lead">
          A blueprint says how many questions a paper holds, which lessons they come
          from, and what level of thinking each one asks for. Generation follows it.
        </p>
        {failed ? (
          <LoadFailed what="your classes" onRetry={() => window.location.reload()} />
        ) : classes === null ? (
          <SkeletonText lines={4} label="Loading your classes…" />
        ) : (
          <ClassPicker classes={classes} onOpen={(id) => navigate(`/assessor/blueprint/${id}`)} />
        )}
      </div>
    );
  }

  if (failed) {
    return (
      <div className="assessor-body assessor-stack">
        <LoadFailed what="this blueprint" onRetry={load} />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="assessor-body assessor-stack">
        <SkeletonText lines={6} label="Loading the blueprint…" />
      </div>
    );
  }

  const lesson = lessons.find((entry) => String(entry.id) === String(lessonId)) ?? null;
  const gridTotal = draft.grid.reduce((sum, row) => sum + splitItems(row), 0);
  const levelTotal = splitItems(draft.levels);

  return (
    <div className="assessor-body assessor-stack tos-screen">
      <ScreenHeader
        back={{ label: "Blueprints", onClick: () => navigate("/assessor/blueprint") }}
        eyebrow={course ? `${course.code}${course.section ? ` · ${course.section}` : ""}` : ""}
        title="Table of Specification"
      >
        <button type="button" className="btn btn--primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save blueprint"}
        </button>
      </ScreenHeader>

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

            <p className="tos-note">
              Every question comes from {lesson?.title ?? "this lesson"}, so all that is
              left to decide is what kind of thinking they ask for.
            </p>

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
            <h2 className="tos-block__title">Where the questions come from</h2>
            <ContentSplit
              lessons={lessons}
              counts={draft.content}
              total={draft.finalItems}
              onChange={setContent}
              onEven={spreadEvenly}
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
            <p className={`tos-check${levelTotal === draft.finalItems ? " is-ok" : ""}`}>
              {levelTotal === draft.finalItems
                ? `All ${draft.finalItems} questions have a level.`
                : `The levels add up to ${levelTotal}, and the exam is ${draft.finalItems}.`}
            </p>
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

export default TosPage;
