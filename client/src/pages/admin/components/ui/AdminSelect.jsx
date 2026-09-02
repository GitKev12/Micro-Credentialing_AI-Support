import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "../icons";

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
 *
 * `variant` is an extra class on the root, so a caller can restyle the trigger
 * without this component knowing what it is being used for. `ListFilter` uses
 * it to draw two of these as one joined control; a select standing on its own
 * passes nothing and is unchanged.
 */
export function AdminSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  disabled = false,
  variant = ""
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
    <div
      className={["admin-select", variant, open ? "is-open" : ""].filter(Boolean).join(" ")}
      ref={rootRef}
    >
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
