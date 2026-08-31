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
          // Stops here rather than carrying on to the window listener
          // AdminModal closes on. These dropdowns sit inside forms — closing
          // the list was taking the half-filled form down with it.
          event.stopPropagation();
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
 * Tag-style multi-select: pick many from a dropdown, each shown as a removable
 * chip. Built on top of `AdminSelect` rather than beside it — the dropdown is
 * one AdminSelect whose options are only the values not yet chosen, so it keeps
 * the same listbox, keyboard model and rich two-line rows for free. Choosing an
 * option adds a chip and drops it from the list; the trigger always shows its
 * placeholder because it holds no single "value".
 *
 * `values` is an array of chosen option values; `options` are { value, label,
 * meta? }, the same shape AdminSelect takes.
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
  autoComplete = "off",
  multiline = false,
  rows = 4
}) {
  const id = useId();

  // Same field, two shapes: anything paragraph-length gets a box it can be
  // read back in while it is being written, rather than a one-line slot that
  // scrolls its own beginning out of sight.
  const Control = multiline ? "textarea" : "input";

  return (
    <div className="admin-field">
      <label className="admin-field__label" htmlFor={id}>
        {label}
        {required ? <span className="admin-field__required"> *</span> : null}
      </label>
      <Control
        id={id}
        className={`admin-input${multiline ? " admin-input--multiline" : ""}`}
        {...(multiline ? { rows } : { type })}
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
  // Whether the press that is about to become a click started on the backdrop.
  // Selecting text in a field and releasing outside the panel produces a click
  // whose target is the backdrop, which used to read as "dismiss" and threw
  // away everything typed into the form.
  const fromBackdrop = useRef(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        fromBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const onBackdrop = event.target === event.currentTarget && fromBackdrop.current;
        fromBackdrop.current = false;
        if (onBackdrop) onClose();
      }}
    >
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

/**
 * Labelled progress bar (module completion).
 *
 * The API sends `completed` and `total` alongside the percentage and this
 * used to render the percentage alone — "60%" tells an admin far less than
 * "3 of 5 modules", and the two together tell them most. A course with no
 * modules uploaded reads as exactly that rather than as a student sitting
 * at 0%, which is a different problem with a different fix.
 */
