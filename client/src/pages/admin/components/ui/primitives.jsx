import { ChevronLeftIcon } from "../icons";

/**
 * Page title + subtitle, with an optional action button on the right.
 *
 * `icon` is the same glyph the sidebar uses for this section, so the rail and
 * the page agree about where you are — the mark is carried across rather than
 * dropped the moment the screen opens. It is decorative: the heading beside it
 * already says the name, so a screen reader is not made to hear it twice.
 */
export function PageHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="admin-header">
      <div className="admin-header__lead">
        {Icon ? (
          <span className="admin-header__mark" aria-hidden="true">
            <Icon size={22} />
          </span>
        ) : null}
        <div>
          <h1 className="admin-header__title">{title}</h1>
          {subtitle ? <p className="admin-header__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * A card's heading, with the glyph for what the card holds.
 *
 * Every one of these was a bare <h2 className="admin-card__title">. Keeping
 * the icon in a component rather than repeating the span at each heading means
 * the spacing is decided once, and a card that gains a heading later gets the
 * same one for free.
 */
export function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="admin-card__title admin-card__title--icon">
      {Icon ? (
        <span className="admin-card__title-mark" aria-hidden="true">
          <Icon size={18} />
        </span>
      ) : null}
      {children}
    </h2>
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

/**
 * Blue metric tile used on the detail screens.
 *
 * `icon` is the glyph for whatever the tile counts — a medal for badges, a
 * clipboard for papers — and it leads the label rather than sitting in a
 * square of its own: the tile is small, and a second block of colour beside
 * the figure would compete with the figure. Decorative, because the label it
 * leads already says the same word.
 */
export function StatTile({ value, label, note, icon: Icon }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat__value">{value}</div>
      <div className="admin-stat__label">
        {Icon ? (
          <span className="admin-stat__mark" aria-hidden="true">
            {/* Sized here, not left to the glyph: `CoursesIcon` is also the
                nav's, where it is drawn at 20, and a nav-sized mark beside a
                14px label would out-weigh the label. */}
            <Icon size={15} />
          </span>
        ) : null}
        {label}
      </div>
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
