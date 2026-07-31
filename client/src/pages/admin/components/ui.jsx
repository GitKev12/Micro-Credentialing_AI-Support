import { ChevronLeftIcon, SearchIcon } from "./icons";

/** Page title + subtitle, with an optional action button on the right. */
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="admin-header">
      <div>
        <h1 className="admin-header__title">{title}</h1>
        {subtitle ? <p className="admin-header__subtitle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Design-system Button — "primary solid" (teal) is the only hierarchy in use. */
export function AdminButton({ children, variant = "", ...rest }) {
  const className = ["admin-btn", variant].filter(Boolean).join(" ");
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  );
}

export function SearchField({ value, onChange, placeholder, label }) {
  return (
    <div className="admin-search">
      <span className="admin-search__icon">
        <SearchIcon />
      </span>
      <input
        className="admin-search__input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function StatusPill({ label = "Active" }) {
  return (
    <span className="admin-pill">
      <span className="admin-pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function BackLink({ children, onClick }) {
  return (
    <button type="button" className="admin-back" onClick={onClick}>
      <ChevronLeftIcon />
      {children}
    </button>
  );
}

/** Blue metric tile used on the detail screens. */
export function StatTile({ value, label }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat__value">{value}</div>
      <div className="admin-stat__label">{label}</div>
    </div>
  );
}

/** Circular initials badge shown beside a person's name in the tables. */
export function Avatar({ name }) {
  const initials = String(name ?? "")
    .split(/\s+/)
    .filter((part) => /[a-z]/i.test(part))
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return (
    <span className="admin-avatar" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

/** Labelled progress bar (module completion). */
export function ProgressRow({ label, pct }) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="admin-progress__row">
        <span>{label}</span>
        <span className="admin-progress__pct">{value}%</span>
      </div>
      <div
        className="admin-progress__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="admin-progress__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
