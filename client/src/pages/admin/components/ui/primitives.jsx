import { ChevronLeftIcon } from "../icons";

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

export function BackLink({ children, onClick }) {
  return (
    <button type="button" className="admin-back" onClick={onClick}>
      <ChevronLeftIcon />
      {children}
    </button>
  );
}

/** Blue metric tile used on the detail screens. */
export function StatTile({ value, label, note }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat__value">{value}</div>
      <div className="admin-stat__label">{label}</div>
      {note ? <div className="admin-stat__note">{note}</div> : null}
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
