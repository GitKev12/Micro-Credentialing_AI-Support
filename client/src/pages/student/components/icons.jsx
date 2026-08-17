/**
 * Icon set for the student area — inline SVGs, everything painted with
 * `currentColor` so a single colour token drives icon and label together.
 *
 * The band icons are load-bearing, not decoration: the status palette says
 * colour must never carry meaning alone, so each band pairs a distinct
 * silhouette (check / alert) with its word.
 */

const line = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

/* ── Band icons ─────────────────────────────────────────── */

export function StrongIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.4l2.6 2.6L16 9.6" {...line} />
    </svg>
  );
}

export function WeakIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4.2L21 19.5H3L12 4.2z" {...line} />
      <path d="M12 10v4" {...line} />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

const BAND_ICONS = {
  strong: StrongIcon,
  weak: WeakIcon
};

/**
 * Picks the silhouette that belongs to a band id from performance.js. An
 * unknown band falls back to the alert, because a topic nobody could place is
 * the one worth looking at, not the one worth a tick.
 */
export function BandIcon({ band, size = 14 }) {
  const Icon = BAND_ICONS[band] ?? WeakIcon;
  return <Icon size={size} />;
}

/* ── Navigation & chrome ────────────────────────────────── */

export function CoursesIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 015.5 4H10a2 2 0 012 2v13a2 2 0 00-2-1.6H4V5.5z" {...line} />
      <path d="M20 5.5A1.5 1.5 0 0018.5 4H14a2 2 0 00-2 2v13a2 2 0 012-1.6h6V5.5z" {...line} />
    </svg>
  );
}

export function DashboardIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function SearchIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M21 21l-4.35-4.35" {...line} />
    </svg>
  );
}

export function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.8l4.6 4.6L19 7.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9.5l6 6 6-6" {...line} strokeWidth="2" />
    </svg>
  );
}

export function QuizIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8a2 2 0 012 2v13a1 1 0 01-1 1H7a2 2 0 01-2-2V6a2 2 0 012-2z" {...line} />
      <path d="M9 9.5h6M9 13h6M9 16.5h3" {...line} />
    </svg>
  );
}

export function LockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.8a4 4 0 018 0v2.7" {...line} />
    </svg>
  );
}

export function BackIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" {...line} />
    </svg>
  );
}

export function ArrowIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" {...line} />
    </svg>
  );
}

export function LogoutIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" {...line} />
      <path d="M16 17l5-5-5-5M21 12H9" {...line} />
    </svg>
  );
}

export function SunIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.4 12H2M22 12h-2.4M6.3 6.3L4.6 4.6M19.4 19.4l-1.7-1.7M17.7 6.3l1.7-1.7M4.6 19.4l1.7-1.7" {...line} />
    </svg>
  );
}

export function MoonIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 13.4A8.2 8.2 0 1110.6 4a6.6 6.6 0 009.4 9.4z" {...line} />
    </svg>
  );
}

/* ── Stat-tile glyphs ───────────────────────────────────── */

export function BookIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4.8A1.8 1.8 0 015.8 3H18a1 1 0 011 1v14.5H6a2 2 0 00-2 2V4.8z" {...line} />
      <path d="M6 18.5h13V21H6a2 2 0 010-2.5z" {...line} />
    </svg>
  );
}

export function SkillsIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V9.5M10 19V4.5M16 19v-7M22 19H2" {...line} />
    </svg>
  );
}

export function TargetIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function CertificateIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 8.5h9M7.5 12h5" {...line} />
      <path d="M15 15.5l1.8 5 1.7-1.4 2 .9-2-4.5" {...line} />
    </svg>
  );
}

export function DownloadIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5" {...line} />
      <path d="M4.5 17.5v1.5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5v-1.5" {...line} />
    </svg>
  );
}

export function BadgeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.4 13.4L7 21l5-2.4 5 2.4-1.4-7.6" {...line} />
    </svg>
  );
}

export function ChartIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19h16" {...line} />
      <rect x="5" y="11" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="11" y="7" width="4" height="9" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="17" y="13" width="2.5" height="3" rx="1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function TableIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M10 9.5V19.5" {...line} />
    </svg>
  );
}
