import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchSubmissionReview,
  saveSubmissionReview,
  storedAssessorId
} from "../../services/assessors";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "./components/icons";
import { Chip, ScreenHeader, Segmented } from "./components/ui";

const LAYOUTS = [
  { key: "focus", label: "Focus" },
  { key: "stacked", label: "Stacked" }
];

/** The AI's own verdict — a flagged item falls back to its best guess. Undefined when AI never scored the item. */
const aiVerdict = (item) => (item.verdict === "flagged" ? item.aiGuess : item.verdict);

function ReviewPage() {
  const navigate = useNavigate();
  const { submissionId } = useParams();

  const [layout, setLayout] = useState("focus");
  const [overrides, setOverrides] = useState({});
  const [typed, setTyped] = useState(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [review, setReview] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(null); // "draft" | "release" while a save runs
  const [draftSaved, setDraftSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId || !submissionId) {
      setLoadError(true);
      return undefined;
    }

    fetchSubmissionReview(assessorId, submissionId)
      .then((data) => {
        if (!active) return;
        setReview(data);

        // Resume a saved draft: restore the overrides and — when the stored
        // score differs from what the item verdicts imply — the typed score.
        const saved = data?.review ?? {};
        const savedOverrides = saved.overrides ?? {};
        setOverrides(savedOverrides);
        if (saved.status === "draft" && saved.finalScore !== null) {
          const points = data.reviewConfig.pointsPerItem;
          const implied = data.items.reduce((sum, item) => {
            const verdict = savedOverrides[item.id] ?? aiVerdict(item);
            return sum + (verdict === "correct" ? points : 0);
          }, 0);
          if (saved.finalScore !== implied) setTyped(String(saved.finalScore));
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [submissionId]);

  // Any change to the grade invalidates the "Draft saved" confirmation.
  useEffect(() => {
    setDraftSaved(false);
  }, [overrides, typed]);

  const ITEMS = useMemo(
    () =>
      (review?.items ?? []).map((item) => ({
        ...item,
        // The page treats "ungraded" as undefined; the API sends null.
        verdict: item.verdict ?? undefined,
        aiGuess: item.aiGuess ?? undefined,
        why: item.why ?? undefined
      })),
    [review]
  );

  // Fallbacks for a review whose config never arrived. PASS is 60% of TOTAL —
  // TSU's standard passing percentage, the same rule the server applies.
  const { pointsPerItem: PTS = 5, total: TOTAL = 50, passMark: PASS = 30 } =
    review?.reviewConfig ?? {};
  const isManual = review?.aiStatus === "unavailable";

  /** The verdict in force for an item: your override, else the AI's (undefined until graded). */
  const effective = (item) => overrides[item.id] ?? aiVerdict(item);

  /** Whether an item still needs the assessor's attention. */
  const needsAttention = (item) =>
    isManual ? effective(item) === undefined : item.verdict === "flagged" && !overrides[item.id];

  const totals = useMemo(() => {
    const aiScore = ITEMS.reduce((sum, it) => sum + (aiVerdict(it) === "correct" ? PTS : 0), 0);
    const computed = ITEMS.reduce(
      (sum, it) => sum + ((overrides[it.id] ?? aiVerdict(it)) === "correct" ? PTS : 0),
      0
    );
    const gradedCount = ITEMS.filter((it) => (overrides[it.id] ?? aiVerdict(it)) !== undefined).length;
    const final = typed === null ? computed : parseInt(typed, 10) || 0;
    const overrideCount = ITEMS.filter(
      (it) => overrides[it.id] && overrides[it.id] !== aiVerdict(it)
    ).length;
    const openFlags = ITEMS.filter((it) => it.verdict === "flagged" && !overrides[it.id]).length;

    return { aiScore, computed, gradedCount, final, delta: final - aiScore, overrideCount, openFlags };
  }, [overrides, typed, ITEMS, PTS]);

  const setVerdict = (itemId, verdict) => {
    setOverrides((current) => ({ ...current, [itemId]: verdict }));
    setTyped(null);
  };

  const reset = () => {
    setOverrides({});
    setTyped(null);
  };

  const save = async (action) => {
    setSaving(action);
    try {
      await saveSubmissionReview(storedAssessorId(), submissionId, {
        action,
        overrides,
        finalScore: totals.final
      });
      if (action === "release") {
        navigate("/assessor/credentials");
      } else {
        setDraftSaved(true);
      }
    } catch {
      // Keep the assessor's work on screen; they can retry the save.
    } finally {
      setSaving(null);
    }
  };

  if (loadError) {
    return (
      <>
        <ScreenHeader
          back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
          eyebrow="Review"
          title="Submission not found"
        />
        <div className="assessor-body">
          <p className="assessor-meta">
            This submission could not be loaded. It may have been graded already.
          </p>
        </div>
      </>
    );
  }

  if (!review) {
    return (
      <>
        <ScreenHeader
          back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
          eyebrow="Review"
          title="Loading submission…"
        />
        <div className="assessor-body">
          <p className="assessor-meta">Fetching answers and AI grading…</p>
        </div>
      </>
    );
  }

  const canReset = typed !== null || Object.keys(overrides).length > 0;
  const passed = totals.final >= PASS;
  const isFocus = layout === "focus";

  const deltaLabel = isManual
    ? `${totals.gradedCount} / ${ITEMS.length} graded`
    : totals.delta === 0
      ? "Same as AI"
      : `${totals.delta > 0 ? "+" : ""}${totals.delta} vs AI`;

  /** Chip describing where an item's verdict came from. */
  const itemChip = (item) => {
    const verdict = effective(item);
    if (verdict === undefined) return { tone: "outline", label: "Not graded yet" };

    if (isManual) {
      return verdict === "correct"
        ? { tone: "info", label: "You marked correct" }
        : { tone: "danger", label: "You marked incorrect" };
    }

    const overridden = overrides[item.id] && overrides[item.id] !== aiVerdict(item);
    const openFlag = item.verdict === "flagged" && !overrides[item.id];

    if (overridden) return { tone: "brand", label: "You changed this" };
    if (openFlag) return { tone: "outline", label: "Needs your review" };
    return verdict === "correct"
      ? { tone: "info", label: "AI · correct" }
      : { tone: "danger", label: "AI · incorrect" };
  };

  const VerdictButtons = ({ item, large }) => {
    const verdict = effective(item);
    const size = large ? " verdict-btn--lg" : "";
    return (
      <div className="verdict-group">
        <button
          type="button"
          className={`verdict-btn${size}${verdict === "correct" ? " is-on-correct" : ""}`}
          onClick={() => setVerdict(item.id, "correct")}
        >
          Correct
        </button>
        <button
          type="button"
          className={`verdict-btn${size}${verdict === "incorrect" ? " is-on-wrong" : ""}`}
          onClick={() => setVerdict(item.id, "incorrect")}
        >
          Incorrect
        </button>
      </div>
    );
  };

  /**
   * Every option the student could have picked, with the key and their answer
   * marked on the rows themselves.
   *
   * This used to be two pills carrying bare letters — "Student · c", "Key · a" —
   * which tells an assessor nothing unless they already have the paper open
   * beside them. Deciding whether the AI marked an item fairly means reading
   * what the student actually chose against what they could have chosen.
   */
  const AnswerChoices = ({ item }) => {
    const choices = item.choices ?? [];

    // Submissions graded before the review payload carried the options fall
    // back to the letters, which is all those records hold.
    if (choices.length === 0) {
      const verdict = effective(item);
      const tone =
        verdict === undefined
          ? "answer-pill--neutral"
          : verdict === "correct"
            ? "answer-pill--correct"
            : "answer-pill--wrong";
      return (
        <div className="item-card__answers">
          <span className={`answer-pill ${tone}`}>Student · {item.choice ?? "—"}</span>
          <span className="answer-pill answer-pill--key">Key · {item.key ?? "—"}</span>
        </div>
      );
    }

    return (
      <ul className="choice-list">
        {choices.map((choice) => {
          const isKey = choice.id === item.key;
          const isPicked = choice.id === item.choice;
          const state = isPicked ? (isKey ? " is-right" : " is-wrong") : isKey ? " is-key" : "";

          // Multiple-choice ids are single letters and read well in the badge.
          // A true-false item is answered by the word — id "true", text "True" —
          // so a badge there would overflow the circle and then say the same
          // thing twice.
          const letter = choice.id.length === 1 ? choice.id : null;

          return (
            <li key={choice.id} className={`choice${state}`}>
              {letter ? <span className="choice__id">{letter}</span> : null}
              <span className="choice__text">{choice.text}</span>
              <span className="choice__tags">
                {isKey ? <span className="choice__tag choice__tag--key">Correct answer</span> : null}
                {isPicked ? (
                  <span className="choice__tag choice__tag--picked">Student's answer</span>
                ) : null}
              </span>
            </li>
          );
        })}

        {item.choice == null ? <li className="choice choice--blank">Left unanswered</li> : null}
      </ul>
    );
  };

  const AiNote = ({ item }) =>
    item.why ? (
      <div className="ai-note">
        <span className="ai-note__tag">AI</span>
        <span className="ai-note__body">{item.why}</span>
      </div>
    ) : (
      <div className="ai-note ai-note--manual">
        <span className="ai-note__tag ai-note__tag--manual">Manual</span>
        <span className="ai-note__body">No AI note for this item — compare the answer with the key and mark it yourself.</span>
      </div>
    );

  const focusItem = ITEMS[focusIdx];

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={review.assessment.meta}
        title={`${review.submission.studentName} — ${review.assessment.title}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <span className="assessor-meta">Layout</span>
          <Segmented options={LAYOUTS} value={layout} onChange={setLayout} label="Review layout" />
        </div>
      </ScreenHeader>


      <div className="assessor-body">
        <div className="review-grid--stacked">
          {/* ---- Answer sheet ---- */}
          {!isFocus ? (
            <div className="assessor-stack--tight" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--sp-4)",
                  flexWrap: "wrap"
                }}
              >
                <h2 className="assessor-card-title" style={{ margin: 0 }}>
                  Answer sheet · {ITEMS.length} items
                </h2>
                <div className="review-legend">
                  <span className="review-legend__item">
                    <span className="legend-dot" style={{ background: "var(--teal-700)" }} />
                    Correct
                  </span>
                  <span className="review-legend__item">
                    <span className="legend-dot" style={{ background: "var(--pink-100)" }} />
                    Incorrect
                  </span>
                  <span className="review-legend__item">
                    <span className="legend-dot" style={{ background: "var(--brand)" }} />
                    {isManual ? "Not graded yet" : "Needs review"}
                  </span>
                </div>
              </div>

              {ITEMS.map((item) => {
                const chip = itemChip(item);

                return (
                  <article
                    key={item.id}
                    className={`item-card${needsAttention(item) ? " is-flagged" : ""}`}
                  >
                    <div className="item-card__grid">
                      <span className="item-card__num">{item.n}</span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="item-card__q" style={{ margin: 0 }}>
                          {item.q}
                        </p>
                        <AnswerChoices item={item} />
                        <AiNote item={item} />
                      </div>

                      <div className="item-card__side">
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                        <VerdictButtons item={item} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {/* ---- Focus layout ---- */}
          {isFocus ? (
            <div className="focus-wrap">
              <div className="focus-nav">
                <button
                  type="button"
                  className="btn btn--pill"
                  disabled={focusIdx === 0}
                  onClick={() => setFocusIdx((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeftIcon size={14} />
                  Previous
                </button>

                <div className="focus-dots">
                  {ITEMS.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Go to item ${item.n}`}
                      className={`focus-dot${index === focusIdx ? " is-current" : ""}${
                        needsAttention(item) && index !== focusIdx ? " is-flagged" : ""
                      }`}
                      onClick={() => setFocusIdx(index)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="btn btn--pill"
                  disabled={focusIdx === ITEMS.length - 1}
                  onClick={() => setFocusIdx((i) => Math.min(ITEMS.length - 1, i + 1))}
                >
                  Next
                  <ChevronRightIcon size={14} />
                </button>
              </div>

              <article
                className={`item-card${needsAttention(focusItem) ? " is-flagged" : ""}`}
              >
                <div className="focus-card__head">
                  <span className="focus-card__step">
                    Item {focusItem.n} of {ITEMS.length}
                  </span>
                  <Chip tone={itemChip(focusItem).tone}>{itemChip(focusItem).label}</Chip>
                </div>

                <p className="focus-card__q" style={{ margin: 0 }}>
                  {focusItem.q}
                </p>

                <AnswerChoices item={focusItem} />
                <AiNote item={focusItem} />

                <div className="focus-card__verdicts">
                  <span className="assessor-meta">Your verdict</span>
                  <VerdictButtons item={focusItem} large />
                </div>
              </article>
            </div>
          ) : null}

          {/* ---- Grading panel ---- */}
          <aside className="grade-panel">
            {isManual ? (
              <div className="grade-panel__ai grade-panel__ai--manual">
                <span className="grade-panel__ai-label">
                  <span className="chip__dot" style={{ background: "var(--gray-400)" }} />
                  Manual grading — AI unavailable
                </span>
                {review.aiStatusReason ? (
                  <span className="grade-panel__ai-hint">{review.aiStatusReason}</span>
                ) : null}
                <span className="grade-panel__ai-hint">
                  {totals.gradedCount} of {ITEMS.length} items graded
                </span>
              </div>
            ) : (
              <div className="grade-panel__ai">
                <span className="grade-panel__ai-label">
                  <span className="chip__dot" style={{ background: "var(--blue-hard)" }} />
                  AI suggested grade
                </span>
                <span className="grade-panel__ai-score">
                  <strong>{totals.aiScore}</strong>
                  <span>/ {TOTAL}</span>
                </span>
                <span className="grade-panel__ai-hint">
                  {totals.aiScore / PTS} of {ITEMS.length} items matched ·{" "}
                  {ITEMS.filter((i) => i.verdict === "flagged").length} flagged for your review
                </span>
              </div>
            )}

            <div className="grade-panel__body">
              <div>
                <div className="field-label">Your grade</div>
                <div className="score-input-row">
                  <input
                    className="score-input"
                    type="text"
                    inputMode="numeric"
                    aria-label="Final score"
                    value={totals.final}
                    onChange={(event) => setTyped(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <span className="score-denom">/ {TOTAL}</span>
                  <Chip
                    tone={
                      isManual
                        ? totals.gradedCount === ITEMS.length
                          ? "success"
                          : "outline"
                        : totals.delta === 0
                          ? "neutral"
                          : "brand-soft"
                    }
                  >
                    {deltaLabel}
                  </Chip>
                </div>
                <div className="score-hint">
                  <span>
                    {typed !== null && totals.final !== totals.computed
                      ? `Typed manually — item total is ${totals.computed}`
                      : "From your item verdicts"}
                  </span>
                  {canReset ? (
                    <button type="button" className="link-btn" onClick={reset}>
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grade-divider" />

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {isManual ? (
                  <div className="summary-line">
                    <span>Items graded</span>
                    <strong>
                      {totals.gradedCount === ITEMS.length ? "All graded" : `${totals.gradedCount} / ${ITEMS.length}`}
                    </strong>
                  </div>
                ) : (
                  <>
                    <div className="summary-line">
                      <span>Items you overrode</span>
                      <strong>{totals.overrideCount}</strong>
                    </div>
                    <div className="summary-line">
                      <span>Flags still open</span>
                      <strong>{totals.openFlags === 0 ? "All resolved" : totals.openFlags}</strong>
                    </div>
                  </>
                )}
                <div className="summary-line">
                  <span>Credential threshold</span>
                  <Chip tone={passed ? "success" : "danger"}>
                    {passed ? `Passed · ${PASS} needed` : `Below ${PASS} / ${TOTAL}`}
                  </Chip>
                </div>
              </div>

              <div className="grade-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={saving !== null || (isManual && totals.gradedCount < ITEMS.length)}
                  title={
                    isManual && totals.gradedCount < ITEMS.length
                      ? "Mark every item before approving a manual grade."
                      : undefined
                  }
                  onClick={() => save("release")}
                >
                  <CheckIcon size={17} />
                  {saving === "release" ? "Releasing…" : "Approve & release"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={saving !== null}
                  onClick={() => save("draft")}
                >
                  {saving === "draft" ? "Saving…" : draftSaved ? "Draft saved ✓" : "Save draft"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export default ReviewPage;
