import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchCourseTos, saveCourseTos, storedAssessorId } from "../../../../services/assessors";
import { readError } from "../../../../services/readError";
import { LoadFailed, Segmented } from "../ui";
import { SkeletonText } from "../../../../components/Skeleton";
import AllocationBar from "./AllocationBar";
import ContentSplit from "./ContentSplit";
import ItemsField from "./ItemsField";
import LevelSplit from "./LevelSplit";
import Matrix from "./Matrix";
import SaveButton from "./SaveButton";
import TypeSplit from "./TypeSplit";
import { animateHeight, animateHeightClipped, heightOf } from "./resize";
import {
  DEFAULT_FINAL_ITEMS,
  LEVEL_KEYS,
  apportion,
  autoFill,
  columnTotals,
  defaultSplit,
  emptySplit,
  levelsTaken,
  readTrueFalse,
  resizeSplit,
  setLevelWithinTotal,
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
 * A class writing the assess-only pathway has a blueprint of its own rather
 * than a second table inside the course's: its examination covers the same
 * lessons at a different length, and it has no lesson quizzes at all. Which
 * document this is, is the server's answer to the class it is sent — the
 * screen only says which class is asking.
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

// How long the button shows "Saved" or "Not saved" before going back to "Save changes".
const SAVE_RESULT_MS = 2500;

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

  const stated = toCount(tos?.final?.items);
  // 40 was the previous standard, so a blueprint that still carries it is
  // treated as unset and opened on 60. A different saved count is kept.
  const finalItems = stated && stated !== 40 ? stated : DEFAULT_FINAL_ITEMS;

  // The level split, read from what is stored. A document that states its own
  // levels keeps them; one that only has a matrix falls back to that matrix's
  // columns; and a fresh blueprint opens on the 30/70 spread the curriculum
  // draws the paper at, so there is a starting balance to adjust rather than a
  // grid of zeros to type into.
  const stored = tos?.final?.levels;
  const storedValues = stored ? LEVEL_KEYS.map((key) => toCount(stored[key])) : [];
  const columns = columnTotals(grid);
  const levels = storedValues.some((value) => value > 0)
    ? Object.fromEntries(LEVEL_KEYS.map((key, index) => [key, storedValues[index]]))
    : LEVEL_KEYS.some((key) => toCount(columns[key]) > 0)
      ? columns
      : defaultSplit(finalItems);

  // The assessor's True or False counts. Null is the default (the LOTS count).
  const quizTypes = Object.fromEntries(
    lessons.map((lesson) => [lesson.id, readTrueFalse(quizRows.get(String(lesson.id))?.trueFalse)])
  );
  const finalTrueFalse = readTrueFalse(tos?.final?.trueFalse);

  return { quizzes, quizTypes, finalItems, content, levels, finalTrueFalse, grid };
}

function TosEditor({
  courseId,
  classId = null,
  assessOnly = false,
  defaultMode,
  defaultLesson,
  frame = null,
  headerEnd,
  onReady,
  onSaved,
  onDirtyChange
}) {
  const assessorId = storedAssessorId();

  const [data, setData] = useState(null);
  // The whole refusal rather than a flag: the server says why, and a boolean
  // left the screen to guess — it always guessed the network.
  const [failure, setFailure] = useState(null);
  // "idle", "saving", "saved" or "failed" — what the Save button shows.
  const [saveState, setSaveState] = useState("idle");
  // Why the last save failed. Stays on screen until a save works, because the
  // button's "Not saved" is gone again after a moment.
  const [saveError, setSaveError] = useState(null);
  // The draft as last loaded or saved, to tell whether there are unsaved edits.
  const [savedJson, setSavedJson] = useState(null);
  // The levels before a change that took items from other levels, so it can
  // be undone: { paper: "lesson" | "final", split, text }.
  const [undo, setUndo] = useState(null);

  // Opened from the generate screen, so it opens on the paper that screen is
  // pointed at — the assessor came here about that one, and we keep it there.
  // An assess-only class writes one paper, so there is nothing to switch
  // between and the editor opens on it.
  const [mode, setMode] = useState(assessOnly ? "final" : (defaultMode ?? "lesson"));
  const [lessonId] = useState(defaultLesson ?? "");
  const [draft, setDraft] = useState(null);

  /* ── Switching paper ──────────────────────────────────────────────────────
   *
   * Two boxes move, so both are animated: the paper, which is as long as the
   * blueprint on it, and the dialog around it, which is as long as it can be.
   * The dialog has a ceiling and the paper has not, so the paper almost always
   * runs past it — leaving the dialog to grow a little and then scroll the
   * rest. Animating only the dialog left its scrollbar arriving at its final
   * size on the first frame, because the new paper's whole length was already
   * under it.
   *
   * Both heights are taken before the switch, and both ends are measured
   * before either animation starts: holding the paper in shortens the dialog,
   * so the dialog has to be measured while the paper is still at its full
   * length or it would be told to stop where it started. */
  const paper = useRef(null);
  // The two heights the switch is leaving behind, or null when the paper on
  // screen is the one it opened on and there is nothing to grow from.
  const leaving = useRef(null);

  const changeMode = (nextMode) => {
    if (nextMode === mode) return;
    leaving.current = { frame: heightOf(frame?.current), paper: heightOf(paper.current) };
    setMode(nextMode);
  };

  useLayoutEffect(() => {
    const was = leaving.current;
    if (!was) return undefined;
    leaving.current = null;

    // The dialog first, while the paper is still at its full new length.
    const frameGrow = animateHeight(frame?.current, was.frame);
    const paperGrow = animateHeightClipped(paper.current, was.paper);

    return () => {
      frameGrow?.cancel();
      paperGrow?.cancel();
    };
  }, [mode, frame]);

  /* ── Loading ──────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!courseId || !assessorId) return;
    onReady?.(false);
    setFailure(null);

    try {
      const payload = await fetchCourseTos(assessorId, courseId, classId);
      const loaded = readTos(payload.tos, payload.lessons ?? []);
      setData(payload);
      setDraft(loaded);
      setSavedJson(JSON.stringify(loaded));
      onReady?.(true);
    } catch (error) {
      setFailure(readError(error, "This blueprint could not be loaded."));
    }
  }, [assessorId, courseId, classId, onReady]);

  useEffect(() => {
    load();
  }, [load]);

  // Unsaved edits, told to the dialog so it can ask before closing.
  const dirty = draft !== null && savedJson !== null && JSON.stringify(draft) !== savedJson;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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

  // When a level change took items from other levels, say so and offer Undo.
  // Typing 10 into one level can empty all the others in one go.
  const noteTaken = (paperName, before, after, key) => {
    const taken = levelsTaken(before, after, key);
    setUndo(taken.length ? { paper: paperName, split: before, text: `Took ${taken.join(", ")}.` } : null);
  };

  const setQuizSplit = (split) =>
    setDraft((current) => ({ ...current, quizzes: { ...current.quizzes, [lessonId]: split } }));

  // Same rule as the final: a level change never adds a question. The extra
  // item comes out of another level (see setLevelWithinTotal).
  const setQuizLevel = (key, value) => {
    const after = setLevelWithinTotal(quizSplit, key, value, quizItems);
    setQuizSplit(after);
    noteTaken("lesson", quizSplit, after, key);
  };

  const undoTaken = () => {
    if (undo.paper === "lesson") setQuizSplit(undo.split);
    else patch({ levels: undo.split });
    setUndo(null);
  };

  /**
   * Retargeting a quiz keeps the mix it already has.
   *
   * Changing 10 items to 20 and being handed a blank split would throw away
   * the decision the assessor came here to make, so the existing proportions
   * are re-apportioned instead: a 1/2/3/4 paper doubles to 2/4/6/8 rather than
   * emptying. With nothing set yet there is nothing to keep, so the first count
   * opens on the curriculum's 30/70 spread rather than on six zeros.
   *
   * resizeSplit does both. This used to read the 30/70 default as if it were a
   * list of numbers, so a lesson with no levels yet came back as 0 items.
   */
  const setQuizItems = (next) => {
    setQuizSplit(resizeSplit(quizSplit, next));
    // The old levels were for the old length, so they can't be put back.
    setUndo(null);
  };

  // The final's length works the same way.
  const setFinalItems = (next) => {
    patch({ finalItems: next, levels: resizeSplit(draft.levels, next) });
    setUndo(null);
  };

  const quizTrueFalse = draft?.quizTypes?.[lessonId] ?? null;

  // Null puts the count back on the default.
  const setQuizTrueFalse = (value) =>
    setDraft((current) => ({
      ...current,
      quizTypes: { ...current.quizTypes, [lessonId]: value }
    }));

  const setFinalTrueFalse = (value) => patch({ finalTrueFalse: value });

  const setContent = (id, value) => patch({ content: { ...draft.content, [id]: value } });

  const spreadEvenly = () => {
    const shares = apportion(draft.finalItems, lessons.map(() => 1));
    patch({
      content: Object.fromEntries(lessons.map((lesson, index) => [lesson.id, shares[index]]))
    });
  };

  const setFinalLevel = (key, value) => {
    const after = setLevelWithinTotal(draft.levels, key, value, draft.finalItems);
    patch({ levels: after });
    noteTaken("final", draft.levels, after, key);
  };

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

  // Puts the button back to "Save changes" a moment after it shows the result.
  useEffect(() => {
    if (saveState !== "saved" && saveState !== "failed") return undefined;
    const timer = setTimeout(() => setSaveState("idle"), SAVE_RESULT_MS);
    return () => clearTimeout(timer);
  }, [saveState]);

  const save = async () => {
    setSaveState("saving");
    setSaveError(null);
    // What is being saved, so it counts as saved once the server takes it.
    const sent = JSON.stringify(draft);
    try {
      const payload = await saveCourseTos(assessorId, courseId, {
        // An assess-only class has no lesson quizzes, so it writes no rows for
        // them. The server stores none either way; sending none keeps the two
        // ends saying the same thing.
        rows: assessOnly
          ? []
          : lessons.map((lesson) => ({
              moduleId: lesson.id,
              course: lesson.title,
              ...draft.quizzes[lesson.id],
              trueFalse: draft.quizTypes[lesson.id] ?? null
            })),
        final: {
          items: draft.finalItems,
          levels: draft.levels,
          trueFalse: draft.finalTrueFalse,
          rows: lessons.map((lesson, index) => ({
            moduleId: lesson.id,
            coverage: lesson.title,
            target: draft.content[lesson.id] ?? 0,
            ...draft.grid[index]
          }))
        }
      }, classId);
      setData((current) => ({ ...current, tos: payload.tos }));
      setSavedJson(sent);
      setUndo(null);
      setSaveState("saved");
      onSaved?.(payload.tos);
    } catch (error) {
      setSaveState("failed");
      setSaveError(readError(error, "The blueprint could not be saved.").message);
    }
  };

  /* ── Views ────────────────────────────────────────────────────────────── */

  if (failure) {
    return (
      <div className="tos-editor">
        <LoadFailed
          what="this blueprint"
          reason={failure.message}
          status={failure.status}
          onRetry={load}
        />
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
    <div className="tos-editor tos-editor--loaded assessor-stack">
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
          <SaveButton state={saveState} onClick={save} />
          {headerEnd}
        </div>
      </header>

      {saveError ? (
        <p className="tos-editor__error" role="alert">
          Not saved: {saveError}
        </p>
      ) : null}

      {/* One paper, so no choice of paper. Kept out rather than shown with
          the Lesson half dead — a switch with one working side is a question
          the assessor has to answer before they can ignore it. */}
      {assessOnly ? null : (
        <Segmented
          label="Which paper"
          value={mode}
          onChange={changeMode}
          options={[
            { key: "lesson", label: "Lesson" },
            { key: "final", label: "Final exam" }
          ]}
        />
      )}

      <div className="tos-editor__mode" key={mode} ref={paper}>
        {mode === "lesson" ? (
          <>
          <section className="assessor-card tos-block">
          <div className="tos-block__head">
            <div>
              <h2 className="tos-block__title">Lesson exam</h2>
              {lessons.length ? (
                <span className="tos-editor__lesson-label">
                  {lessons.find((entry) => String(entry.id) === String(lessonId))?.title}
                </span>
              ) : null}
            </div>
            <div className="tos-block__tools">
              <ItemsField value={quizItems} max={MAX_ITEMS} onChange={setQuizItems} />
            </div>
          </div>

          <AllocationBar target={quizItems} split={quizSplit} />

          <LevelSplit split={quizSplit} total={quizItems} onChange={setQuizLevel} />
          {undo?.paper === "lesson" ? <UndoLine text={undo.text} onUndo={undoTaken} /> : null}
          </section>

          <QuestionTypesBlock
            split={quizSplit}
            total={quizItems}
            trueFalse={quizTrueFalse}
            onChange={setQuizTrueFalse}
          />
          </>
        ) : (
          <>
          <section className="assessor-card tos-block">
            <div className="tos-block__head">
              <h2 className="tos-block__title">The exam</h2>
              <div className="tos-block__tools">
                <ItemsField value={draft.finalItems} max={MAX_ITEMS} onChange={setFinalItems} />
              </div>
            </div>

            <AllocationBar target={draft.finalItems} split={draft.levels} />
          </section>

          <section className="assessor-card tos-block">
            <div className="tos-block__head">
              <h2 className="tos-block__title">Where the questions come from</h2>
              <div className="tos-block__tools">
                <Tally placed={contentTotal} of={draft.finalItems} />
                <button type="button" className="btn btn--ghost" onClick={spreadEvenly}>
                  Spread evenly
                </button>
              </div>
            </div>
            <ContentSplit
              lessons={lessons}
              counts={draft.content}
              total={draft.finalItems}
              onChange={setContent}
            />
          </section>

          <section className="assessor-card tos-block">
            <h2 className="tos-block__title">Cognitive levels</h2>
            <LevelSplit split={draft.levels} total={draft.finalItems} onChange={setFinalLevel} />
            {undo?.paper === "final" ? <UndoLine text={undo.text} onUndo={undoTaken} /> : null}
          </section>

          <QuestionTypesBlock
            split={draft.levels}
            total={draft.finalItems}
            trueFalse={draft.finalTrueFalse}
            onChange={setFinalTrueFalse}
          />

          <section className="assessor-card tos-block">
            <div className="tos-block__head">
              <h2 className="tos-block__title">The matrix</h2>
              <div className="tos-block__tools">
                <Tally placed={gridTotal} of={draft.finalItems} />
                <button type="button" className="btn btn--ghost" onClick={buildMatrix}>
                  Fill from the splits
                </button>
              </div>
            </div>
            <Matrix
              lessons={lessons}
              rows={draft.grid}
              rowTargets={draft.content}
              colTargets={draft.levels}
              onCell={setCell}
            />
          </section>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * How much of the exam this card has placed, in the card's own head.
 *
 * It was a sentence under the table — "The matrix matches the exam." — which
 * is read once and then stops being looked at, and on the longest card in the
 * blueprint it sat a scroll below the cells it was reporting on. The figures
 * are what the assessor is after, and they move as the cells are typed.
 */
function Tally({ placed, of }) {
  const state = placed === of ? " is-ok" : placed > of ? " is-over" : "";

  return (
    <span className={`tos-placed${state}`}>
      <span className="tos-placed__n">{placed}</span>
      <span className="tos-placed__of">of {of} placed</span>
    </span>
  );
}

/** "Took 3 from Understanding. [Undo]" under the levels after a change took items. */
function UndoLine({ text, onUndo }) {
  return (
    <p className="tos-undo" role="status">
      <span className="tos-undo__text">{text}</span>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onUndo}>
        Undo
      </button>
    </p>
  );
}

/**
 * The True or False / Multiple Choice card. It never changes the cognitive
 * levels. "Use Default" puts the counts back on the LOTS/HOTS numbers, and
 * only shows once the assessor has changed them.
 */
function QuestionTypesBlock({ split, total, trueFalse, onChange }) {
  return (
    <section className="assessor-card tos-block">
      <div className="tos-block__head">
        <h2 className="tos-block__title">Question types</h2>
        {trueFalse !== null ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(null)}>
            Use Default
          </button>
        ) : null}
      </div>
      <TypeSplit split={split} total={total} trueFalse={trueFalse} onChange={onChange} />
    </section>
  );
}

export default TosEditor;
