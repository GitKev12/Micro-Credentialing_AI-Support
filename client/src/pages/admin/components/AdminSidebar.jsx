import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearAuthSession } from "../../../auth/services/authService";
import { THEMES, getStoredTheme, toggleTheme } from "../../../services/theme";
import { useGlidingPill } from "../../../hooks/useGlidingPill";
import { useDrawer } from "../../../hooks/useDrawer";
import {
  AssessorsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClassesIcon,
  CloseIcon,
  CoursesIcon,
  MenuIcon,
  MoonIcon,
  SignOutIcon,
  StudentsIcon,
  SunIcon,
  UserIcon
} from "./icons";

// Ordered the way the work runs: build the catalog, form the classes that enrol
// and assign the people, then correct individual records.
//
// The Table of Specification is not here. A blueprint is an instruction to the
// generator — how long a paper is, which lessons it draws on, what thinking it
// demands — and the person who can give it is the one teaching the course, so
// it lives in the assessor console.
//
// A class carries a schedule, but only as a label — the timetable an admin
// writes on it opens and locks nothing. A quiz still becomes available to a
// student when that student finishes reading its lesson; there is no
// schedule-driven release date, so there is still no "generate quizzes" screen
// for choosing when quizzes appear.
const NAV_ITEMS = [
  { to: "/admin/courses", label: "Courses", Icon: CoursesIcon },
  { to: "/admin/classes", label: "Classes", Icon: ClassesIcon },
  { to: "/admin/students", label: "Students", Icon: StudentsIcon },
  { to: "/admin/assessors", label: "Assessors", Icon: AssessorsIcon }
];

const COLLAPSED_KEY = "adminSidebarCollapsed";

function AdminSidebar({ name, idNumber }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSED_KEY) === "1"
  );
  // Below md this same rail is the drawer behind the menu button. Folding
  // it to icons means nothing there, so the remembered state is set aside
  // rather than cleared: widen the window and the rail comes back as it was.
  const drawer = useDrawer("Admin menu");
  const folded = collapsed && !drawer.isDrawer;
  const here = NAV_ITEMS.find(({ to }) => location.pathname.startsWith(to));
  // The active pill glides between nav items, login-toggle style. It re-measures
  // when the route changes or the rail changes width — folding, or becoming
  // the drawer — since any of those moves the active item.
  const { pillRef, pillStyle } = useGlidingPill(".admin-nav-item.is-active", [
    location.pathname,
    folded,
    drawer.isDrawer
  ]);
  // Shares the app-wide theme switch with the student and assessor interfaces.
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
      <header className="admin-mobilebar">
        <span className="admin-mobilebar__title">{here?.label ?? "Admin"}</span>
        <button
          type="button"
          className="admin-mobilebar__menu"
          aria-label="Open menu"
          {...drawer.triggerProps}
        >
          <MenuIcon />
        </button>
      </header>

      <div
        className={`admin-scrim${drawer.open ? " is-open" : ""}`}
        onClick={drawer.close}
        aria-hidden="true"
      />

      <aside
        className={`admin-sidebar${folded ? " admin-sidebar--collapsed" : ""}${
          drawer.open ? " is-open" : ""
        }`}
        {...drawer.panelProps}
      >
        {drawer.isDrawer ? (
          <button
            type="button"
            className="admin-sidebar__close"
            onClick={drawer.close}
            aria-label="Close menu"
          >
            <CloseIcon size={18} />
          </button>
        ) : null}

        <button
          type="button"
          className="admin-sidebar__toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={folded ? "Expand sidebar" : "Collapse sidebar"}
          title={folded ? "Expand" : "Collapse"}
        >
          {folded ? <ChevronRightIcon size={15} /> : <ChevronLeftIcon size={15} />}
        </button>

        <div className="admin-sidebar__top">
          <div className="admin-sidebar__identity">
            <div className="admin-sidebar__avatar">
              <UserIcon size={36} color="currentColor" />
            </div>
            <div className="admin-sidebar__who">
              <span className="admin-sidebar__name">{name}</span>
              <span className="admin-sidebar__id">{idNumber}</span>
            </div>
          </div>

          <nav className="admin-sidebar__nav" aria-label="Admin sections" ref={pillRef}>
            <span className="admin-nav-item__pill" style={pillStyle} aria-hidden="true" />
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={folded ? label : undefined}
                className={({ isActive }) => `admin-nav-item${isActive ? " is-active" : ""}`}
              >
                <Icon size={18} />
                <span className="admin-nav-item__label">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <button
          type="button"
          className="admin-sidebar__theme"
          onClick={() => setTheme(toggleTheme())}
          role="switch"
          aria-checked={isDark}
          title={folded ? (isDark ? "Light mode" : "Dark mode") : undefined}
        >
          {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
          <span className={`admin-theme-switch${isDark ? " is-on" : ""}`} aria-hidden="true">
            <span className="admin-theme-switch__thumb" />
          </span>
        </button>
        <div className="admin-sidebar__signout-wrap">
          <button
            type="button"
            className="admin-sidebar__signout"
            onClick={handleSignOut}
            title={folded ? "Sign Out" : undefined}
          >
            <SignOutIcon size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default AdminSidebar;
