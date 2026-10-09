/**
 * The Save button on the Table of Specification.
 *
 * `state` is one of:
 *   "idle"   — Save changes
 *   "saving" — Saving… (the button is off so it can't be pressed twice)
 *   "saved"  — a check and "Saved"
 *   "failed" — an X in a circle and "Not saved"
 *
 * The editor puts it back to "idle" a moment after it shows the result.
 * The strokes use pathLength="1" so the CSS can draw them in from 0 to 1.
 */

const LABELS = {
  idle: "Save changes",
  saving: "Saving…",
  saved: "Saved",
  failed: "Not saved"
};

// Read out by screen readers, which don't always notice a button's text change.
const ANNOUNCEMENTS = {
  saved: "Blueprint saved.",
  failed: "That did not save. Try again."
};

function CheckMark() {
  return (
    <svg className="tos-save__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        className="tos-save__stroke"
        d="M5 12.5l4.5 4.5L19 7.5"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossMark() {
  return (
    <svg className="tos-save__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        className="tos-save__ring"
        cx="12"
        cy="12"
        r="9.5"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        className="tos-save__stroke"
        d="M9 9l6 6M15 9l-6 6"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SaveButton({ state = "idle", onClick }) {
  return (
    <>
      <button
        type="button"
        className="btn btn--primary tos-save"
        data-state={state}
        disabled={state === "saving"}
        onClick={onClick}
      >
        {state === "saved" ? <CheckMark /> : null}
        {state === "failed" ? <CrossMark /> : null}
        {/* The key gives the word a fresh element each time, so it animates in again. */}
        <span key={state} className="tos-save__label">
          {LABELS[state]}
        </span>
      </button>
      <span className="assessor-sr-only" role="status">
        {ANNOUNCEMENTS[state] ?? ""}
      </span>
    </>
  );
}
