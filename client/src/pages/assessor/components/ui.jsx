import { Select } from "../../../components/Select";
import { Skeleton } from "../../../components/Skeleton";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon
} from "./icons";

/**
 * The assessor console's select: the shared listbox in this console's clothes.
 *
 * A native <select> hands its list to the operating system, which draws it in
 * the system's type on the system's white — the one control on these screens
 * that did not follow the theme, and the reason a lesson had to say whether
 * its paper was out by trailing an em dash after the title. This one is the
 * console's, so `meta` gets a line of its own above the label.
 */
export function AssessorSelect(props) {
  return (
    <Select
      {...props}
      classPrefix="assessor-select"
      CaretIcon={ChevronDownIcon}
      TickIcon={CheckIcon}
    />
  );
}

/** Screen header: optional back link, eyebrow, title, and a right-hand slot. */
export function ScreenHeader({ back, eyebrow, title, children }) {
  return (
    <header className="assessor-header">
      <div className="assessor-header__lead">
        {back ? (
          <button type="button" className="assessor-back" onClick={back.onClick}>
            <ChevronLeftIcon />
            {back.label}
          </button>
        ) : null}
        <h1 className="assessor-title">{title}</h1>
        {eyebrow ? <div className="assessor-eyebrow">{eyebrow}</div> : null}
      </div>
      {children}
    </header>
  );
}

/** KPI tile — the whole card is the action, anchored by a per-stat icon. */
export function StatCard({ value, label, action, onAction, icon }) {
  return (
    <button
      type="button"
      className="stat-card"
      onClick={onAction}
      aria-label={`${label}: ${value}. ${action}.`}
    >
      {icon ? (
        <span className="stat-card__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__action">
        {action}
        <ChevronRightIcon size={15} />
      </span>
    </button>
  );
}

export function Chip({ tone = "neutral", dot = false, children }) {
  return (
    <span className={`chip chip--${tone}`}>
      {dot ? <span className="chip__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function SearchField({ value, onChange, placeholder, label }) {
  return (
    <div className="assessor-search">
      <span className="assessor-search__icon">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          className={`segmented__btn${value === option.key ? " is-active" : ""}`}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A name, with the id number under it where there is one.
 *
 * It carried an avatar disc until these lists became tables. The same generic
 * silhouette forty times down a column tells an assessor nothing about the
 * person on any one row, and it takes the width from the columns that do — this
 * system holds no photograph for it to stand in for.
 *
 * `as` is the escape hatch for rendering this inside a <button>: a button may
 * only contain phrasing content, so the default <div> would be invalid there.
 */
export function Person({ name, sid, as: Tag = "div" }) {
  return (
    <Tag className="person">
      <span className="person__name">{name}</span>
      {sid ? <span className="person__id">{sid}</span> : null}
    </Tag>
  );
}

export function ProgressBar({ label, pct }) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="progress__row">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="progress__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Squares showing earned micro-credentials out of a total. */
export function CredentialDots({ earned, total }) {
  return (
    <div className="cred-dots">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`cred-dot${index < earned ? " is-on" : ""}`} />
      ))}
      <span className="cred-dots__label">
        {earned}/{total}
      </span>
    </div>
  );
}

/** Small stacked label + value used inside data rows. */
export function Metric({ label, value, hint }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}</div>
      {hint ? <div className="metric__hint">{hint}</div> : null}
    </div>
  );
}

/**
 * A read that did not come back.
 *
 * Every screen here used to answer a failed request by emptying its list,
 * which made a dropped connection look exactly like a class with nobody in it
 * — the assessor was told something false about their own course and had no
 * reason to doubt it. This says what actually happened, and gives them the one
 * thing that might fix it rather than making them find the page again.
 */
export function LoadFailed({ what, onRetry }) {
  return (
    <div className="load-failed" role="alert">
      <span>{what} could not be loaded. Check your connection and try again.</span>
      {onRetry ? (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * A screen of this console, mid-load.
 *
 * Built out of the console's own header and table rather than a stack of bars,
 * so the shapes waiting are the shapes that arrive and the page does not jump
 * when they do. It stands in for a page whose code has not been fetched yet —
 * every screen here is loaded on demand — which is why it has to work without
 * knowing which screen it is standing in for.
 */
export function ScreenSkeleton({ label = "Loading…", rows = 6, cols = 5 }) {
  return (
    <>
      <header className="assessor-header">
        <div className="assessor-header__lead">
          <Skeleton w="11rem" h={26} />
        </div>
      </header>

      <div className="assessor-body">
        <div className="assessor-table-wrap" role="status" aria-live="polite">
          <span className="assessor-sr-only">{label}</span>

          <table className="assessor-table" aria-hidden="true">
            <thead>
              <tr>
                {Array.from({ length: cols }, (_, col) => (
                  <th key={col}>
                    <Skeleton w={col === 0 ? "40%" : "60%"} h={9} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, row) => (
                <tr key={row}>
                  {Array.from({ length: cols }, (_, col) => (
                    <td key={col}>
                      <Skeleton w={col === 0 ? "70%" : col === cols - 1 ? "40%" : "55%"} h={11} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
