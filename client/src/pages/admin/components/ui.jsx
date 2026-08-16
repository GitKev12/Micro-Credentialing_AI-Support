import { useEffect, useId, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseIcon,
  SearchIcon
} from "./icons";

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

/**
 * Filter field for the list screens.
 *
 * The clear button is ours rather than the one `type="search"` gives you:
 * WebKit and Blink draw a small unstyled grey cross that ignores the design
 * system, and Firefox draws nothing at all, so the control looked different
 * depending on the browser and was missing in one of them.
 *
 * `hint` is optional and is where a screen reports how much its filter
 * matched — typing into a search that silently narrows a list below the fold
 * leaves you guessing whether it did anything.
 */
export function SearchField({ value, onChange, placeholder, label, hint }) {
  return (
    <div className="admin-search">
      <div className="admin-search__field">
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
        {value ? (
          <button
            type="button"
            className="admin-search__clear"
            onClick={() => onChange("")}
            aria-label="Clear search"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
      {hint && value ? <span className="admin-search__hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Select built as a listbox rather than a native <select>.
 *
 * A native select's popup is drawn by the operating system: it cannot take
 * the interface's radii, spacing, dark theme or type, and it cannot show an
 * option as anything richer than one line of plain text. This one is ours, so
 * each row carries the course code above its title — the thing that actually
 * tells two similarly-named courses apart.
 *
 * Follows the ARIA select-only combobox pattern: focus stays on the trigger
 * and `aria-activedescendant` points at the highlighted row, so screen readers
 * track the highlight without focus ever moving into the list.
 *
 * `options` are { value, label, meta? }.
 */
export function AdminSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState("bottom");
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const typeahead = useRef({ term: "", at: 0 });
  const id = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view by scrolling the list itself. Calling
  // scrollIntoView here would also scroll every scrollable ancestor, which
  // drags the page behind the open dropdown.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const list = listRef.current;
    const item = list?.children[activeIndex];
    if (!list || !item) return;

    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [open, activeIndex]);

  const openList = (index) => {
    if (disabled || options.length === 0) return;

    // These sit at the bottom of a card, so a list that always drops downward
    // can open straight off the bottom of the window. Flip it above the
    // trigger when that is the roomier side.
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setPlacement(below < 280 && rect.top > below ? "top" : "bottom");
    }

    setActiveIndex(index ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  };

  const choose = (index) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const step = (delta) => {
    if (options.length === 0) return;
    setActiveIndex((current) => {
      const from = current < 0 ? selectedIndex : current;
      const next = Math.max(0, Math.min(options.length - 1, from + delta));
      return next;
    });
  };

  const onKeyDown = (event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        open ? step(1) : openList();
        return;
      case "ArrowUp":
        event.preventDefault();
        open ? step(-1) : openList();
        return;
      case "Home":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        open ? choose(activeIndex) : openList();
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        break;
    }

    // Typeahead: letters jump to the next option starting with what you type.
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    const now = Date.now();
    const term =
      (now - typeahead.current.at < 600 ? typeahead.current.term : "") + event.key.toLowerCase();
    typeahead.current = { term, at: now };

    const match = options.findIndex((option) => option.label.toLowerCase().startsWith(term));
    if (match < 0) return;
    if (open) setActiveIndex(match);
    else onChange(options[match].value);
  };

  const isEmpty = options.length === 0;

  return (
    <div className={`admin-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="admin-select__trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={label}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
        disabled={disabled || isEmpty}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={`admin-select__value${selected ? "" : " is-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="admin-select__caret">
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {open ? (
        <ul
          className="admin-select__list"
          id={`${id}-list`}
          role="listbox"
          data-placement={placement}
          ref={listRef}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`admin-select__option${index === activeIndex ? " is-active" : ""}`}
              // onMouseDown, not onClick: the document mousedown listener that
              // closes the list fires first otherwise and the click is lost.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="admin-select__option-text">
                {option.meta ? (
                  <span className="admin-select__option-meta">{option.meta}</span>
                ) : null}
                <span className="admin-select__option-label">{option.label}</span>
              </span>
              {option.value === value ? (
                <span className="admin-select__tick">
                  <CheckIcon size={15} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A labelled field for the create and edit forms.
 *
 * The label is a real <label> bound by id rather than a styled div, so clicking
 * it focuses the input and a screen reader reads the two as one thing. `hint`
 * is where a field explains itself — a password rule, or what an empty value
 * will mean — which is worth more beneath the box than in a tooltip.
 */
export function AdminField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  disabled = false,
  required = false,
  autoComplete = "off"
}) {
  const id = useId();

  return (
    <div className="admin-field">
      <label className="admin-field__label" htmlFor={id}>
        {label}
        {required ? <span className="admin-field__required"> *</span> : null}
      </label>
      <input
        id={id}
        className="admin-input"
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="admin-field__hint">{hint}</p> : null}
    </div>
  );
}

/**
 * Centred dialog for the forms and the delete confirmations.
 *
 * Escape closes it and the backdrop click closes it, because a dialog that can
 * only be dismissed by finding the right button is a trap on a small screen.
 * Nothing here traps focus: that needs more than this component is, and the
 * forms it holds are short enough that tabbing past them is not the hazard a
 * half-built focus trap would be.
 */
export function AdminModal({ title, subtitle, onClose, children, footer, tone = "" }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div
        className={`admin-modal__panel admin-modal__panel--form${tone ? ` ${tone}` : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__head">
          <div>
            <h2 className="admin-modal__title">{title}</h2>
            {subtitle ? <p className="admin-modal__meta">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="admin-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="admin-modal__body">{children}</div>

        {footer ? <div className="admin-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * The confirmation for anything that destroys records.
 *
 * `losses` is the list of what goes, read from the server before the dialog can
 * be agreed to — null while that is still loading, which is why the confirm
 * button waits for it. Agreeing to a deletion whose cost has not arrived is
 * agreeing to nothing in particular, and these deletions take student records
 * with them.
 */
export function ConfirmDeleteModal({
  title,
  subject,
  losses,
  keeps = [],
  busy = false,
  confirmLabel = "Delete",
  onCancel,
  onConfirm
}) {
  return (
    <AdminModal
      title={title}
      subtitle={subject}
      tone="admin-modal__panel--danger"
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button
            type="button"
            className="admin-chip-btn admin-chip-btn--quiet"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <AdminButton
            variant="admin-btn--compact admin-btn--danger"
            disabled={busy || !losses}
            onClick={onConfirm}
          >
            {busy ? "Deleting…" : confirmLabel}
          </AdminButton>
        </>
      }
    >
      {!losses ? (
        <p className="admin-empty-note">Checking what this would remove…</p>
      ) : (
        <>
          {losses.length > 0 ? (
            <>
              <p className="admin-modal__lead">This will also permanently delete:</p>
              <ul className="admin-loss-list">
                {losses.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="admin-modal__lead">Nothing else depends on this.</p>
          )}

          {keeps.length > 0 ? (
            <>
              <p className="admin-modal__lead">What stays:</p>
              <ul className="admin-loss-list admin-loss-list--keep">
                {keeps.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="admin-empty-note">This cannot be undone.</p>
        </>
      )}
    </AdminModal>
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

/**
 * Labelled progress bar (module completion).
 *
 * The API sends `completed` and `total` alongside the percentage and this
 * used to render the percentage alone — "60%" tells an admin far less than
 * "3 of 5 modules", and the two together tell them most. A course with no
 * modules uploaded reads as exactly that rather than as a student sitting
 * at 0%, which is a different problem with a different fix.
 */
export function ProgressRow({ label, pct, completed, total }) {
  const value = Math.max(0, Math.min(100, pct));
  const counted = Number.isFinite(total) && total > 0;
  const detail = counted ? `${completed} of ${total} modules · ${value}%` : "No modules yet";

  return (
    <div>
      <div className="admin-progress__row">
        <span className="admin-progress__label">{label}</span>
        <span className="admin-progress__pct">{detail}</span>
      </div>
      <div
        className="admin-progress__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${detail}`}
      >
        <div className="admin-progress__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
