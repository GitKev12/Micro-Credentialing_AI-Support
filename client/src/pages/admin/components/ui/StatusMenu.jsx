import { useEffect, useRef, useState } from "react";

import { MoreIcon } from "../icons";

const OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archive" }
];

// The 3-dots button at the end of a table row, with its status menu.
// Used by the Courses, Students and Assessors tables.
export function StatusMenu({ name, status, busy, onChange }) {
  const [open, setOpen] = useState(false);
  // Where the menu sits on screen, next to the button (wide screens only).
  const [place, setPlace] = useState(null);
  const menuRef = useRef(null);

  // While open: close on a click outside, on Escape, or on scroll.
  useEffect(() => {
    if (!open) return undefined;

    const close = () => setOpen(false);
    const onClick = (event) => {
      if (!menuRef.current?.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const current = status ?? "active";

  return (
    // stopPropagation: clicking the row opens it, the menu must not.
    <div className="admin-row-menu" ref={menuRef} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="admin-row-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        disabled={busy}
        onClick={(event) => {
          // Fixed to the screen so the table card can't cut it off.
          // Phones use the bottom sheet from the CSS instead.
          const box = event.currentTarget.getBoundingClientRect();
          const wide = window.matchMedia?.("(min-width: 52.0625rem)").matches;
          setPlace(
            wide ? { position: "fixed", top: box.bottom + 8, right: window.innerWidth - box.right } : null
          );
          setOpen((isOpen) => !isOpen);
        }}
      >
        <MoreIcon />
      </button>

      {open ? (
        <ul className="admin-row-menu__list" role="menu" style={place ?? undefined}>
          {OPTIONS.map((option) => (
            <li key={option.value} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={current === option.value}
                className={`admin-row-menu__item${current === option.value ? " is-current" : ""}`}
                onClick={() => {
                  setOpen(false);
                  if (option.value !== current) onChange(option.value);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
