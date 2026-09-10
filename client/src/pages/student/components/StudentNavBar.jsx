import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearAuthSession, getStoredSession } from "../../../auth/services/authService";
import { resolveAvatarUrl } from "../../../services/avatar";
import { THEMES, getStoredTheme, toggleTheme } from "../../../services/theme";
import ProfileAvatar from "./ProfileAvatar";
import { CoursesIcon, DashboardIcon, LogoutIcon, MoonIcon, SunIcon } from "./icons";
import ccsLogo from "../../../assets/ccs-logo.png";

/** The bar greets the student by given name; `displayName` is "First Last". */
function firstName(displayName) {
  const first = String(displayName ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

const NAV_ITEMS = [
  { to: "/student", label: "My Courses", Icon: CoursesIcon, end: true },
  { to: "/student/dashboard", label: "Dashboard", Icon: DashboardIcon, end: false }
];

function CaretIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9.5l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StudentNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme);
  const isDarkMode = theme === THEMES.DARK;

  const student = getStoredSession()?.user;
  const studentName = student?.displayName || student?.identifier || "Student";
  const studentNumber =
    student?.studentNumber || student?.studentNo || student?.identifier || "—";
  const avatarUrl = resolveAvatarUrl(student);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const isCurrent = (item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);

  const go = (to) => {
    setIsOpen(false);
    navigate(to);
  };

  const handleLogout = () => {
    setIsOpen(false);
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sd-topbar">
      <div className="sd-topbar__brand">
        <img
          className="sd-topbar__mark"
          src={ccsLogo}
          alt="College of Computer Studies, Tarlac State University"
        />
        <span className="sd-topbar__rule" aria-hidden="true" />
        <p className="sd-topbar__greeting">
          <span className="sd-topbar__hello">Welcome!</span>
          <span className="sd-topbar__name">{firstName(studentName)}</span>
        </p>
      </div>

      <nav className="sd-topbar__nav" aria-label="Student sections">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.to}
            type="button"
            className="sd-topbar__link"
            aria-current={isCurrent(item) ? "page" : undefined}
            onClick={() => go(item.to)}
          >
            <item.Icon size={17} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sd-profile" ref={menuRef}>
        <button
          type="button"
          className="sd-profile__trigger"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={`Account menu for ${studentName}`}
        >
          <ProfileAvatar src={avatarUrl} name={studentName} size={32} />
          <span className="sd-profile__caret">
            <CaretIcon />
          </span>
        </button>

        {isOpen ? (
          <ul className="sd-menu" role="menu">
            <li role="none" className="sd-menu__head">
              <p className="sd-menu__name">{studentName}</p>
              <p className="sd-menu__sub">{studentNumber}</p>
            </li>

            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <li role="none" key={to}>
                <button
                  type="button"
                  role="menuitem"
                  className="sd-menu__item"
                  onClick={() => go(to)}
                >
                  <span className="sd-menu__item-icon">
                    <Icon size={16} />
                  </span>
                  {label}
                </button>
              </li>
            ))}

            <li role="none">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isDarkMode}
                className="sd-menu__item sd-menu__item--toggle"
                // Menu stays open so the change is visible and easy to flip back.
                onClick={() => setTheme(toggleTheme())}
              >
                <span className="sd-menu__item-icon">
                  {isDarkMode ? <MoonIcon size={16} /> : <SunIcon size={16} />}
                </span>
                Dark mode
                <span className={`sd-switch${isDarkMode ? " is-on" : ""}`} aria-hidden="true">
                  <span className="sd-switch__thumb" />
                </span>
              </button>
            </li>

            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="sd-menu__item sd-menu__item--danger"
                onClick={handleLogout}
              >
                <span className="sd-menu__item-icon">
                  <LogoutIcon size={16} />
                </span>
                Log out
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </header>
  );
}

export default StudentNavBar;
