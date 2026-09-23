import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearAuthSession } from "../../../auth/services/authService";
import { THEMES, getStoredTheme, toggleTheme } from "../../../services/theme";
import { useGlidingPill } from "../../../hooks/useGlidingPill";
import { useDrawer } from "../../../hooks/useDrawer";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClassesIcon,
  CloseIcon,
  CredentialIcon,
  GenerateIcon,
  MenuIcon,
  MoonIcon,
  ResultsIcon,
  SignOutIcon,
  SunIcon,
  UserIcon
} from "./icons";

const NAV_ITEMS = [
  { to: "/assessor/classes", label: "My Classes", Icon: ClassesIcon },
  // The badge counts papers the assessor's classes are still waiting on: one
  // per lesson plus a final per course, less whatever has been posted.
  {
    to: "/assessor/generate",
    label: "Generate Assessment",
    Icon: GenerateIcon,
    countKey: "toPost"
  },
  // What came back off a paper once it went out. Sits after Generate because
  // that is the order the work happens in: write it, post it, then read it.
  { to: "/assessor/results", label: "Results", Icon: ResultsIcon },
  // Passes waiting to be issued. The one screen here that is a queue — every
  // number on it is a student who has finished and is waiting on the assessor
  // — so it is the one that most needs saying so from the rail.
  {
    to: "/assessor/credentials",
    label: "Credentials",
    Icon: CredentialIcon,
    countKey: "credentials"
  }
];

const COLLAPSED_KEY = "assessorSidebarCollapsed";

function AssessorSidebar({ name, idNumber, counts }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSED_KEY) === "1"
  );
  // Below md this same rail is the drawer behind the menu button. Folding it
  // to icons means nothing there, so the remembered state is set aside rather
  // than cleared: widen the window and the rail comes back as it was.
  const drawer = useDrawer("Assessor menu");
  const folded = collapsed && !drawer.isDrawer;
  const here = NAV_ITEMS.find(({ to }) => location.pathname.startsWith(to));
  // With the rail off the screen its counts are too. They are the two things
  // on it that are work waiting, so the button that hides them says there is
  // something behind it.
  const waiting = NAV_ITEMS.reduce(
    (sum, { countKey }) => sum + (countKey ? Number(counts?.[countKey]) || 0 : 0),
    0
  );
  // The active pill glides between nav items, login-style. It re-measures when
  // the route changes or the rail changes width — folding, or becoming the
  // drawer — since any of those moves the active item.
  const { pillRef, pillStyle } = useGlidingPill(".assessor-nav-item.is-active", [
    location.pathname,
    folded,
    drawer.isDrawer
  ]);
  // Shares the app-wide theme switch with the student interface.
  const [theme, setTheme] = useState(getStoredTheme);
  const isDark = theme === THEMES.DARK;

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleSignOut = () => {
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  return (
    <>
      {/* Phone only. Where the rail was, a bar that says which section this
          is and holds the button that brings the rail in from the right. */}
      <header className="assessor-mobilebar">
        <span className="assessor-mobilebar__title">{here?.label ?? "Assessor"}</span>
        <button
          type="button"
          className="assessor-mobilebar__menu"
          aria-label={waiting ? `Open menu, ${waiting} waiting` : "Open menu"}
          {...drawer.triggerProps}
        >
          <MenuIcon />
          {waiting ? <span className="assessor-mobilebar__dot" aria-hidden="true" /> : null}
        </button>
      </header>

      <div
        className={`assessor-scrim${drawer.open ? " is-open" : ""}`}
        onClick={drawer.close}
        aria-hidden="true"
      />

      <aside
        className={`assessor-rail${folded ? " assessor-rail--collapsed" : ""}${
          drawer.open ? " is-open" : ""
        }`}
        {...drawer.panelProps}
      >
        {drawer.isDrawer ? (
          <button
            type="button"
            className="assessor-rail__close"
            onClick={drawer.close}
            aria-label="Close menu"
          >
            <CloseIcon size={18} />
          </button>
        ) : null}

        <button
          type="button"
          className="assessor-rail__toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={folded ? "Expand sidebar" : "Collapse sidebar"}
          title={folded ? "Expand" : "Collapse"}
        >
          {folded ? <ChevronRightIcon size={15} /> : <ChevronLeftIcon size={15} />}
        </button>

        <div className="assessor-rail__identity">
          <span className="assessor-rail__avatar">
            <UserIcon size={56} color="var(--brand)" />
          </span>
          <span className="assessor-rail__who">
            <span className="assessor-rail__name">{name}</span>
            <span className="assessor-rail__id">{idNumber}</span>
          </span>
        </div>

        <nav className="assessor-rail__nav" aria-label="Assessor sections" ref={pillRef}>
          <span className="assessor-nav-item__pill" style={pillStyle} aria-hidden="true" />
          {NAV_ITEMS.map(({ to, label, Icon, countKey }) => {
            const count = countKey ? counts?.[countKey] : null;

            return (
              <NavLink
                key={to}
                to={to}
                title={folded ? label : undefined}
                className={({ isActive }) => `assessor-nav-item${isActive ? " is-active" : ""}`}
              >
                <span className="assessor-nav-item__icon">
                  <Icon size={20} />
                </span>
                <span className="assessor-nav-item__label">{label}</span>
                {count ? <span className="assessor-nav-item__count">{count}</span> : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="assessor-rail__bottom">
          <button
            type="button"
            className="assessor-rail__theme"
            onClick={() => setTheme(toggleTheme())}
            role="switch"
            aria-checked={isDark}
            title={folded ? (isDark ? "Light mode" : "Dark mode") : undefined}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
            <span className="assessor-nav-item__label">{isDark ? "Light Mode" : "Dark Mode"}</span>
            <span className={`theme-toggle${isDark ? " is-on" : ""}`} aria-hidden="true">
              <span className="theme-toggle__thumb" />
            </span>
          </button>

          <button
            type="button"
            className="assessor-rail__signout"
            onClick={handleSignOut}
            title={folded ? "Sign Out" : undefined}
          >
            <SignOutIcon />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default AssessorSidebar;
