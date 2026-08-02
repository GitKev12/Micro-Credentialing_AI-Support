import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { clearAuthSession } from "../../../auth/services/authService";
import { THEMES, getStoredTheme, toggleTheme } from "../../../services/theme";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClassesIcon,
  CredentialIcon,
  MoonIcon,
  QueueIcon,
  SignOutIcon,
  SunIcon,
  UserIcon
} from "./icons";

const NAV_ITEMS = [
  { to: "/assessor/classes", label: "My Classes", Icon: ClassesIcon },
  { to: "/assessor/queue", label: "To Grade", Icon: QueueIcon, countKey: "toGrade" },
  { to: "/assessor/credentials", label: "Credentials", Icon: CredentialIcon }
];

const COLLAPSED_KEY = "assessorSidebarCollapsed";

function AssessorSidebar({ name, idNumber, counts }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSED_KEY) === "1"
  );
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
    <aside className={`assessor-rail${collapsed ? " assessor-rail--collapsed" : ""}`}>
      <button
        type="button"
        className="assessor-rail__toggle"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? <ChevronRightIcon size={15} /> : <ChevronLeftIcon size={15} />}
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

      <nav className="assessor-rail__nav" aria-label="Assessor sections">
        {NAV_ITEMS.map(({ to, label, Icon, countKey }) => {
          const count = countKey ? counts?.[countKey] : null;

          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
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

      <button
        type="button"
        className="assessor-rail__theme"
        onClick={() => setTheme(toggleTheme())}
        role="switch"
        aria-checked={isDark}
        title={collapsed ? (isDark ? "Light mode" : "Dark mode") : undefined}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
        <span className="assessor-nav-item__label">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
        <span className={`theme-toggle${isDark ? " is-on" : ""}`} aria-hidden="true">
          <span className="theme-toggle__thumb" />
        </span>
      </button>

      <button
        type="button"
        className="assessor-rail__signout"
        onClick={handleSignOut}
        title={collapsed ? "Sign Out" : undefined}
      >
        <SignOutIcon />
        <span>Sign Out</span>
      </button>
    </aside>
  );
}

export default AssessorSidebar;
