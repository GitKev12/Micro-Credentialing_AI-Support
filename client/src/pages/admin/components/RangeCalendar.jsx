  import { useEffect, useId, useMemo, useRef, useState } from "react";

import { formatCourseRun } from "../../../lib/courseDuration";

/**
 * The field a course's run is picked in: a trigger showing the run, and a
 * calendar that drops out of it.
 *
 * It replaces a pair of <input type="date">, which handed the job to the
 * browser: one generic picker per field, each opening on its own, neither
 * knowing the other existed. A run is one fact — two days and the span between
 * them — and the two native fields could not show that span, could not stop the
 * end being set before the start, and looked different in every browser while
 * ignoring this console's type, radii and dark theme entirely.
 *
 * The grid is behind a trigger rather than always open: six weeks of cells
 * standing permanently in a form is most of a modal spent on one of its six
 * fields, and the run is usually set once and then left alone. Closed, the
 * field is one line like every other; open, it behaves the way `AdminSelect`
 * does — same trigger shape, same flip when there is no room below, same
 * dismissal on Escape, on a click outside and on Tab.
 *
 * Everything is in UTC, because `courseDuration.js` stores and reads the day
 * rather than the hour: a local-time grid would offer the 4th to a reader west
 * of Greenwich and save the 3rd.
 *
 * The grid itself follows the APG date-picker pattern — a real `role="grid"`,
 * one tab stop moved around it by the arrow keys, and a live region so the
 * month is announced when it changes rather than silently redrawing.
 */

const DAY_MS = 86400000;

/** "YYYY-MM-DD" for a UTC timestamp. */
const toKey = (time) => new Date(time).toISOString().slice(0, 10);

/** UTC midnight for a "YYYY-MM-DD", or null for an empty or unparseable one. */
function fromKey(key) {
  if (!key) return null;
  const time = Date.parse(`${key}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

const startOfMonth = (time) => {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

/**
 * The same day a month or a year away, clamped to the end of the month it
 * lands in: a PageDown from 31 January is 28 February, never 3 March.
 */
function shiftMonths(time, delta) {
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + delta;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay));
}

/**
 * Six weeks from the Sunday on or before the 1st — a fixed 42 cells, so the
 * panel is the same height in a 28-day February as in a 31-day May and does not
 * resize as the months are paged through.
 */
function monthGrid(time) {
  const first = startOfMonth(time);
  const lead = new Date(first).getUTCDay();
  const from = first - lead * DAY_MS;
  return Array.from({ length: 42 }, (_, index) => from + index * DAY_MS);
}

// Built off a known Sunday (1 Sep 2024) so the row of initials is in the
// reader's own language without a table of names living here.
const WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
  new Date(Date.UTC(2024, 8, 1 + index)).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "short"
  })
);

const monthLabel = (time) =>
  new Date(time).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "long",
    year: "numeric"
  });

const dayLabel = (time) =>
  new Date(time).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

/**
 * What a click on `picked` makes of the run so far.
 *
 * A day chosen before the current start turns the pair round rather than being
 * refused — the reader has named the two days they mean, only in the other
 * order, and an inverted run is then impossible to express instead of being
 * caught afterwards by a validation message.
 */
export function nextRange({ startsOn, endsOn }, picked) {
  const start = fromKey(startsOn);

  // Nothing chosen yet, or a whole run already there: this starts a new one.
  if (start === null || endsOn) return { startsOn: picked, endsOn: "" };

  return fromKey(picked) < start
    ? { startsOn: picked, endsOn: startsOn }
    : { startsOn, endsOn: picked };
}

export default function RangeCalendar({
  startsOn,
  endsOn,
  onChange,
  label = "Course duration",
  placeholder = "Choose the course duration",
  required = false,
  disabled = false
}) {
  const id = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const gridRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState("bottom");

  const start = fromKey(startsOn);
  const end = fromKey(endsOn);
  const today = toKey(Date.now());

  const [view, setView] = useState(() => startOfMonth(start ?? Date.now()));
  const [focusKey, setFocusKey] = useState(() => startsOn || today);
  const [hoverKey, setHoverKey] = useState(null);

  // Set by anything that moves the focused day without the pointer, so focus
  // follows it. Taking focus on a pointer click instead would drag it back out
  // of whatever was clicked next.
  const [claimFocus, setClaimFocus] = useState(false);

  useEffect(() => {
    if (!open || !claimFocus) return;
    gridRef.current?.querySelector(`[data-day="${focusKey}"]`)?.focus();
    setClaimFocus(false);
  }, [open, claimFocus, focusKey]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const days = useMemo(() => monthGrid(view), [view]);

  /**
   * The span to paint. While the end is still being chosen it follows the
   * pointer, so the length of the run can be read before it is committed.
   */
  const hover = fromKey(hoverKey);
  let spanFrom = start;
  let spanTo = end;
  if (start !== null && end === null && hover !== null) {
    spanFrom = Math.min(start, hover);
    spanTo = Math.max(start, hover);
  }

  const openPanel = () => {
    if (disabled) return;

    // The panel is tall, and this field sits low in a scrolling modal. Flip it
    // above the trigger when that is the roomier side, as AdminSelect does.
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setPlacement(below < 380 && rect.top > below ? "top" : "bottom");
    }

    setFocusKey(startsOn || today);
    setView(startOfMonth(fromKey(startsOn) ?? Date.now()));
    setHoverKey(null);
    setOpen(true);
    setClaimFocus(true);
  };

  const closePanel = ({ restoreFocus = true } = {}) => {
    setOpen(false);
    setHoverKey(null);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const moveFocus = (time) => {
    setFocusKey(toKey(time));
    setView(startOfMonth(time));
    setClaimFocus(true);
  };

  const pick = (key) => {
    setHoverKey(null);
    const run = nextRange({ startsOn, endsOn }, key);
    onChange(run);

    // A whole run is the answer the field was opened for, so it closes on the
    // day that completes it. The first of the two leaves it open — the run is
    // not chosen yet.
    if (run.startsOn && run.endsOn) closePanel();
  };

  function onGridKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      // Stops here, and does not reach the window listener AdminModal closes
      // on: Escape while the calendar is open dismisses the calendar, not the
      // form around it and everything typed into it.
      event.stopPropagation();
      closePanel();
      return;
    }
    if (event.key === "Tab") {
      closePanel({ restoreFocus: false });
      return;
    }

    const current = fromKey(focusKey);
    if (current === null) return;

    const weekday = new Date(current).getUTCDay();
    let next = null;

    switch (event.key) {
      case "ArrowLeft":
        next = current - DAY_MS;
        break;
      case "ArrowRight":
        next = current + DAY_MS;
        break;
      case "ArrowUp":
        next = current - 7 * DAY_MS;
        break;
      case "ArrowDown":
        next = current + 7 * DAY_MS;
        break;
      case "Home":
        next = current - weekday * DAY_MS;
        break;
      case "End":
        next = current + (6 - weekday) * DAY_MS;
        break;
      case "PageUp":
        next = shiftMonths(current, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = shiftMonths(current, event.shiftKey ? 12 : 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(focusKey);
        return;
      default:
        return;
    }

    event.preventDefault();
    moveFocus(next);
  }

  function onTriggerKeyDown(event) {
    if (open) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPanel();
    }
  }

  // Only a whole run is worth spelling out. `formatCourseRun` will happily
  // describe a half-set one as "From Aug 4, 2026", which reads as a finished
  // answer at the exact moment the field is still waiting for a second click.
  const run = startsOn && endsOn ? formatCourseRun({ startsOn, endsOn }) : null;

  return (
    <div className="admin-field">
      <span className="admin-field__label" id={`${id}-label`}>
        {label}
        {required ? <span className="admin-field__required"> *</span> : null}
      </span>

      <div className={`admin-runpick${open ? " is-open" : ""}`} ref={rootRef}>
        <button
          type="button"
          className="admin-runpick__trigger"
          ref={triggerRef}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${id}-label`}
          disabled={disabled}
          onClick={() => (open ? closePanel() : openPanel())}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="admin-runpick__icon">
            <CalendarGlyph />
          </span>
          <span className={`admin-runpick__value${run ? "" : " is-placeholder"}`}>
            {run ?? placeholder}
          </span>
          <span className="admin-runpick__caret">
            <Chevron direction="down" />
          </span>
        </button>

        {open ? (
          <div
            className="admin-runpick__panel"
            role="dialog"
            aria-label={label}
            data-placement={placement}
          >
            <div className="admin-cal__head">
              <button
                type="button"
                className="admin-cal__page"
                aria-label="Previous month"
                onClick={() => setView(shiftMonths(view, -1))}
              >
                <Chevron direction="left" />
              </button>

              <h3 className="admin-cal__month" id={`${id}-month`}>
                {monthLabel(view)}
              </h3>

              <button
                type="button"
                className="admin-cal__page"
                aria-label="Next month"
                onClick={() => setView(shiftMonths(view, 1))}
              >
                <Chevron direction="right" />
              </button>
            </div>

            {/* The grid redraws silently when the month changes, so the month
                is announced separately rather than left to the cells. */}
            <p className="admin-visually-hidden" aria-live="polite">
              {monthLabel(view)}
            </p>

            <div className="admin-cal__weekdays" aria-hidden="true">
              {WEEKDAYS.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>

            <div
              className="admin-cal__grid"
              role="grid"
              aria-labelledby={`${id}-month`}
              ref={gridRef}
              onKeyDown={onGridKeyDown}
              onMouseLeave={() => setHoverKey(null)}
            >
              {Array.from({ length: 6 }, (_, week) => (
                <div className="admin-cal__week" role="row" key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((time) => {
                    const key = toKey(time);
                    const outside =
                      new Date(time).getUTCMonth() !== new Date(view).getUTCMonth();

                    const isStart = time === spanFrom;
                    const isEnd = time === spanTo;
                    const isBetween =
                      spanFrom !== null && spanTo !== null && time > spanFrom && time < spanTo;

                    // The end is only pencilled in until it is clicked, so the
                    // previewed cap is drawn as an outline of the committed one.
                    const pending = end === null && (isEnd || isBetween);

                    return (
                      <div className="admin-cal__cell" role="gridcell" key={key}>
                        <button
                          type="button"
                          data-day={key}
                          tabIndex={key === focusKey ? 0 : -1}
                          aria-selected={isStart || isEnd}
                          aria-current={key === today ? "date" : undefined}
                          className={[
                            "admin-cal__day",
                            outside ? "is-outside" : "",
                            key === today ? "is-today" : "",
                            isStart ? "is-start" : "",
                            isEnd ? "is-end" : "",
                            isBetween ? "is-between" : "",
                            pending ? "is-pending" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            setFocusKey(key);
                            setView(startOfMonth(time));
                            pick(key);
                          }}
                          onMouseEnter={() => setHoverKey(key)}
                          onFocus={() => setFocusKey(key)}
                        >
                          <span className="admin-visually-hidden">{dayLabel(time)}</span>
                          <span aria-hidden="true">{new Date(time).getUTCDate()}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* What the panel is still waiting for. The finished run is on the
                trigger above, so saying it again here would be the same fact
                twice on one screen. */}
            <div className="admin-cal__foot">
              <span className="admin-cal__prompt" aria-live="polite">
                {startsOn && !endsOn ? "Choose the last day" : null}
                {!startsOn ? "Choose the first day" : null}
              </span>

              {startsOn || endsOn ? (
                <button
                  type="button"
                  className="admin-chip-btn admin-chip-btn--quiet"
                  onClick={() => {
                    onChange({ startsOn: "", endsOn: "" });
                    setHoverKey(null);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 10h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const CHEVRON = {
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  down: "M6 9l6 6 6-6"
};

function Chevron({ direction }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={CHEVRON[direction]}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
