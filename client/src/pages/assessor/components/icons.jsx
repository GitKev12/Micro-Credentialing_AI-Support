/**
 * Icon set for the assessor console — inline SVGs taken from the
 * Instructor End storyboard. Everything paints with `currentColor`.
 */

const line = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

export function ClassesIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 9.5h16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Rows under a heading — one line per student, which is what Results is. */
export function ResultsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 9v11" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 13h6M12 16.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A paper with a spark on it — writing a quiz, rather than marking one. */
export function GenerateIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2v-9" {...line} />
      <path d="M18.5 2.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" {...line} />
      <path d="M8.5 12h5M8.5 16h7" {...line} />
    </svg>
  );
}

/** A clock face — how long a sitting runs. */
export function ClockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" {...line} />
    </svg>
  );
}

/** A pencil — correcting a question the generator got wrong. */
export function PencilIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 10-3-3L5 17v3z" {...line} />
      <path d="M14.5 7l2.5 2.5" {...line} />
    </svg>
  );
}

export function CredentialIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 13.5L7 21l5-2.4L17 21l-1.5-7.5" {...line} />
    </svg>
  );
}

/** Phosphor "User" (thin) — avatar glyph. */
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

export function SignOutIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" {...line} strokeWidth="2" />
    </svg>
  );
}

export function SearchIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** The cross a search field is emptied by — see SearchField. */
export function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** The funnel, for a control that narrows a list rather than searching it. */
export function FilterIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 4.5h14l-5.4 6.3v4.7l-3.2 1.5v-6.2L3 4.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 7l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoonIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" {...line} />
    </svg>
  );
}

export function SunIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" {...line} />
    </svg>
  );
}

/** Opens a stored sheet — the certificate behind a released credential. */
export function DownloadIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5" {...line} />
      <path d="M4.5 17.5v1.5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5v-1.5" {...line} />
    </svg>
  );
}

export function CheckIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The other half of a notice's tone: what a check is for a write that landed,
    this is for one that did not. */
export function AlertIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="12" r="1.15" fill="currentColor" />
    </svg>
  );
}
