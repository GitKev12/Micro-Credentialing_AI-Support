/**
 * Icon set for the admin interface.
 *
 * The nav/user glyphs mirror the Phosphor-style icons used in the
 * Admin-End storyboards; the rest are the inline SVGs from those screens.
 * Every icon paints with `currentColor` so it inherits the surrounding text.
 */

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

export function CoursesIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 015.5 4H19a1 1 0 011 1v13a1 1 0 01-1 1H5.5A1.5 1.5 0 004 20.5V5.5z" {...stroke} />
      <path d="M4 5.5A1.5 1.5 0 005.5 7H20" {...stroke} />
    </svg>
  );
}

export function StudentsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19a5.5 5.5 0 0111 0M15 6.2a3.2 3.2 0 010 6M20.5 19a5.5 5.5 0 00-3.6-5.2" {...stroke} />
    </svg>
  );
}

export function AssessorsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 19.5a6.5 6.5 0 0113 0" {...stroke} />
    </svg>
  );
}

/** Classes — people grouped under a course: two figures on a card. */
export function ClassesIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" {...stroke} />
      <circle cx="9" cy="10" r="1.8" {...stroke} />
      <circle cx="15" cy="10" r="1.8" {...stroke} />
      <path d="M6.5 15a2.8 2.8 0 015 0M12.5 15a2.8 2.8 0 015 0" {...stroke} />
    </svg>
  );
}

export function TosIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h8M8 12h8M8 16h5" {...stroke} />
    </svg>
  );
}

/** Phosphor "User" (thin) — the sidebar and detail-header avatar glyph. */
export function UserIcon({ size = 24, color }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 25 24"
      fill="none"
      style={{ color, display: "block" }}
      aria-hidden="true"
    >
      <path
        d="M24.922 23.252C22.857 19.682 19.547 17.244 15.712 16.365C17.534 15.619 19.041 14.263 19.974 12.529C20.908 10.794 21.21 8.79 20.829 6.858C20.449 4.926 19.409 3.185 17.888 1.935C16.367 0.684 14.459 0 12.489 0C10.52 0 8.612 0.684 7.091 1.935C5.57 3.185 4.53 4.926 4.15 6.858C3.769 8.79 4.071 10.794 5.005 12.529C5.938 14.263 7.445 15.619 9.267 16.365C5.437 17.24 2.122 19.682 0.057 23.252C-0.003 23.366 -0.016 23.499 0.02 23.623C0.056 23.747 0.138 23.852 0.25 23.916C0.361 23.981 0.494 24 0.619 23.969C0.744 23.938 0.853 23.861 0.922 23.752C3.364 19.525 7.692 17.002 12.489 17.002C17.287 17.002 21.614 19.525 24.057 23.752C24.101 23.828 24.164 23.891 24.24 23.935C24.316 23.978 24.402 24.002 24.489 24.002C24.577 24.002 24.664 23.979 24.739 23.934C24.854 23.868 24.938 23.759 24.972 23.631C25.006 23.503 24.988 23.366 24.922 23.252ZM4.989 8.502C4.989 7.018 5.429 5.568 6.253 4.335C7.078 3.102 8.249 2.14 9.619 1.573C10.99 1.005 12.498 0.856 13.953 1.146C15.407 1.435 16.744 2.15 17.793 3.198C18.842 4.247 19.556 5.584 19.845 7.039C20.135 8.493 19.986 10.001 19.418 11.372C18.851 12.742 17.889 13.913 16.656 14.738C15.423 15.562 13.973 16.002 12.489 16.002C10.501 16 8.594 15.209 7.188 13.803C5.782 12.397 4.991 10.49 4.989 8.502Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SignOutIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MoonIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" {...stroke} />
    </svg>
  );
}

export function SunIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
        {...stroke}
      />
    </svg>
  );
}

export function SearchIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 13l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M2 4h11M6 4V2.5h3V4M3.5 4l.6 8.5a1 1 0 001 1h3.8a1 1 0 001-1L11.5 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UploadIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <path
        d="M15 20V7M15 7l-5 5M15 7l5 5M6 22h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A stack of lessons — the modules that make up a course. */
export function ModulesIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="5" rx="1.5" {...stroke} />
      <rect x="3" y="12" width="18" height="5" rx="1.5" {...stroke} />
      <path d="M6.5 20h11" {...stroke} />
    </svg>
  );
}

/** A framed picture — the course's card art. */
export function ImageIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" {...stroke} />
      <circle cx="8.5" cy="10" r="1.6" {...stroke} />
      <path d="M4 17l4.5-4.5a1.5 1.5 0 012 0L15 17M14 15l1.8-1.8a1.5 1.5 0 012 0L21 16" {...stroke} />
    </svg>
  );
}

/* ── Stat-tile glyphs ───────────────────────────────────────────────────────
   Small by default: these sit inline at the head of a tile's label, not in a
   filled square, so they are drawn at label size rather than nav size. */

/** A clipboard, marked — a paper written and posted to a course. */
export function AssessmentIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4H6.5A1.5 1.5 0 005 5.5v14A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5v-14A1.5 1.5 0 0017.5 4H15"
        {...stroke}
      />
      <rect x="9" y="2.5" width="6" height="3.2" rx="1.1" {...stroke} />
      <path d="M8.8 13.2l2.2 2.2 4.2-4.4" {...stroke} />
    </svg>
  );
}

/** A sealed certificate — the micro-credential a finished course awards. */
export function CredentialIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3.5" width="18" height="11.5" rx="2" {...stroke} />
      <path d="M6.5 7.5h9M6.5 11h5.5" {...stroke} />
      <circle cx="16.8" cy="18" r="3.2" {...stroke} />
    </svg>
  );
}

/** A medal on its ribbon — one badge, earned by passing a quiz. */
export function BadgeIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="5" {...stroke} />
      <path d="M8.8 12.3L7.6 21l4.4-2.4 4.4 2.4-1.2-8.7" {...stroke} />
    </svg>
  );
}
