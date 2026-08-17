import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, UserIcon } from "./icons";

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
        {eyebrow ? <div className="assessor-eyebrow">{eyebrow}</div> : null}
        <h1 className="assessor-title">{title}</h1>
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
 * Avatar disc + name + id number, used across every list.
 *
 * `as` exists for the one caller that renders this inside a <button> — the
 * To Grade group heading, which folds a student's submissions. A button may
 * only contain phrasing content, so the default <div> would be invalid there.
 */
export function Person({ name, sid, size = "md", as: Tag = "div" }) {
  return (
    <Tag className="person">
      <span className={`person__disc${size === "lg" ? " person__disc--lg" : ""}`}>
        <UserIcon size={size === "lg" ? 62 : 30} color="var(--brand)" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="person__name">{name}</span>
        {sid ? <span className="person__id" style={{ display: "block" }}>{sid}</span> : null}
      </span>
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
