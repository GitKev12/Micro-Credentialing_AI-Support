import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import data from "./assessorSampleData.json";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "./components/icons";
import { Chip, ScreenHeader, Segmented } from "./components/ui";

const LAYOUTS = [
  { key: "split", label: "Split" },
  { key: "stacked", label: "Stacked" },
  { key: "focus", label: "Focus" }
];

const { pointsPerItem: PTS, total: TOTAL, passMark: PASS } = data.review;
const ITEMS = data.review.items;

/** The AI's own verdict — a flagged item falls back to its best guess. */
const aiVerdict = (item) => (item.verdict === "flagged" ? item.aiGuess : item.verdict);

function ReviewPage() {
  const navigate = useNavigate();
  const { submissionId } = useParams();

  const [layout, setLayout] = useState("split");
  const [overrides, setOverrides] = useState({});
  const [typed, setTyped] = useState(null);
  const [focusIdx, setFocusIdx] = useState(4);

  const submission = data.queue.find((row) => row.id === submissionId) ?? data.queue[0];
  const student = data.roster.find((s) => s.id === submission.studentId) ?? data.roster[0];

  /** The verdict in force for an item: your override, else the AI's. */
  const effective = (item) => overrides[item.id] ?? aiVerdict(item);

  const totals = useMemo(() => {
    const aiScore = ITEMS.reduce((sum, it) => sum + (aiVerdict(it) === "correct" ? PTS : 0), 0);
    const computed = ITEMS.reduce(
      (sum, it) => sum + ((overrides[it.id] ?? aiVerdict(it)) === "correct" ? PTS : 0),
      0
    );
    const final = typed === null ? computed : parseInt(typed, 10) || 0;
    const overrideCount = ITEMS.filter(
      (it) => overrides[it.id] && overrides[it.id] !== aiVerdict(it)
    ).length;
    const openFlags = ITEMS.filter((it) => it.verdict === "flagged" && !overrides[it.id]).length;

    return { aiScore, computed, final, delta: final - aiScore, overrideCount, openFlags };
  }, [overrides, typed]);

  const setVerdict = (itemId, verdict) => {
    setOverrides((current) => ({ ...current, [itemId]: verdict }));
    setTyped(null);
  };

  const reset = () => {
    setOverrides({});
    setTyped(null);
  };

  const canReset = typed !== null || Object.keys(overrides).length > 0;
  const passed = totals.final >= PASS;
  const isSplit = layout === "split";
  const isFocus = layout === "focus";

  const deltaLabel =
    totals.delta === 0
      ? "Same as AI"
      : `${totals.delta > 0 ? "+" : ""}${totals.delta} vs AI`;

  /** Chip describing where an item's verdict came from. */
  const itemChip = (item) => {
    const overridden = overrides[item.id] && overrides[item.id] !== aiVerdict(item);
    const openFlag = item.verdict === "flagged" && !overrides[item.id];

    if (overridden) return { tone: "brand", label: "You changed this" };
    if (openFlag) return { tone: "outline", label: "Needs your review" };
    return effective(item) === "correct"
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

  const AnswerPills = ({ item }) => (
    <div className="item-card__answers">
      <span
        className={`answer-pill ${
          effective(item) === "correct" ? "answer-pill--correct" : "answer-pill--wrong"
        }`}
      >
        Student · {item.choice}
      </span>
      <span className="answer-pill answer-pill--key">Key · {item.key}</span>
    </div>
  );

  const AiNote = ({ item }) => (
    <div className="ai-note">
      <span className="ai-note__tag">AI</span>
      <span className="ai-note__body">{item.why}</span>
    </div>
  );

  const focusItem = ITEMS[focusIdx];

  return (
    <>
      <ScreenHeader
        back={{ label: "To grade", onClick: () => navigate("/assessor/queue") }}
        eyebrow={data.review.assessmentMeta}
        title={`${student.name} — ${data.review.assessmentTitle}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <span className="assessor-meta">Layout</span>
          <Segmented options={LAYOUTS} value={layout} onChange={setLayout} label="Review layout" />
        </div>
      </ScreenHeader>

      <div className="assessor-body">
        <div className={isSplit ? "review-grid" : "review-grid--stacked"}>
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
                    Needs review
                  </span>
                </div>
              </div>

              {ITEMS.map((item) => {
                const chip = itemChip(item);
                const openFlag = item.verdict === "flagged" && !overrides[item.id];

                return (
                  <article
                    key={item.id}
                    className={`item-card${openFlag ? " is-flagged" : ""}`}
                  >
                    <div className="item-card__grid">
                      <span className="item-card__num">{item.n}</span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="item-card__q" style={{ margin: 0 }}>
                          {item.q}
                        </p>
                        <AnswerPills item={item} />
                        <AiNote item={item} />
                      </div>

                      <div className="item-card__side">
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                        <VerdictButtons item={item} />
                        <span className="assessor-meta">
                          {effective(item) === "correct" ? PTS : 0} / {PTS} pts
                        </span>
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
                  {ITEMS.map((item, index) => {
                    const openFlag = item.verdict === "flagged" && !overrides[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Go to item ${item.n}`}
                        className={`focus-dot${index === focusIdx ? " is-current" : ""}${
                          openFlag && index !== focusIdx ? " is-flagged" : ""
                        }`}
                        onClick={() => setFocusIdx(index)}
                      />
                    );
                  })}
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
                className={`item-card${
                  focusItem.verdict === "flagged" && !overrides[focusItem.id] ? " is-flagged" : ""
                }`}
              >
                <div className="focus-card__head">
                  <span className="focus-card__step">
                    Item {focusItem.n} of {ITEMS.length} ·{" "}
                    {effective(focusItem) === "correct" ? PTS : 0} / {PTS} pts
                  </span>
                  <Chip tone={itemChip(focusItem).tone}>{itemChip(focusItem).label}</Chip>
                </div>

                <p className="focus-card__q" style={{ margin: 0 }}>
                  {focusItem.q}
                </p>

                <AnswerPills item={focusItem} />
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
                  <Chip tone={totals.delta === 0 ? "neutral" : "brand-soft"}>{deltaLabel}</Chip>
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
                <div className="summary-line">
                  <span>Items you overrode</span>
                  <strong>{totals.overrideCount}</strong>
                </div>
                <div className="summary-line">
                  <span>Flags still open</span>
                  <strong>{totals.openFlags === 0 ? "All resolved" : totals.openFlags}</strong>
                </div>
                <div className="summary-line">
                  <span>Credential threshold</span>
                  <Chip tone={passed ? "success" : "danger"}>
                    {passed ? `Passed · ${PASS} needed` : `Below ${PASS} / ${TOTAL}`}
                  </Chip>
                </div>
              </div>

              <div className="grade-divider" />

              <div>
                <div className="field-label">
                  Remark to student{" "}
                  <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.7 }}>
                    (optional)
                  </span>
                </div>
                <textarea
                  className="remark-input"
                  rows={3}
                  aria-label="Remark to student"
                  placeholder={data.review.remarkPlaceholder}
                />
              </div>

              <div className="grade-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => navigate("/assessor/credentials")}
                >
                  <CheckIcon size={17} />
                  Approve &amp; release
                </button>
                <button type="button" className="btn btn--ghost">
                  Save draft
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
