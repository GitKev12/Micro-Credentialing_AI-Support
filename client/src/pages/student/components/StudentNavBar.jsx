import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGlidingPill } from "../../../hooks/useGlidingPill";
import { useDrawer } from "../../../hooks/useDrawer";
import { clearAuthSession, getStoredSession } from "../../../auth/services/authService";
import { resolveAvatarUrl } from "../../../services/avatar";
import { THEMES, getStoredTheme, toggleTheme } from "../../../services/theme";
import ProfileAvatar from "./ProfileAvatar";
import {
  CloseIcon,
  CoursesIcon,
  DashboardIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  SunIcon
} from "./icons";
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
  // Below md the account menu is a drawer from the right rather than a card
  // dropping out of the avatar, and it takes over the two section links the
  // bar no longer has room for. Above md, the dropdown is exactly as it was.
  const drawer = useDrawer("Account menu");

  useEffect(() => {
    if (!isOpen || drawer.isDrawer) return undefined;

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
  }, [isOpen, drawer.isDrawer]);

  const isCurrent = (item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);

  const { pillRef, pillStyle } = useGlidingPill(".sd-topbar__link[aria-current='page']", [location.pathname]);

  // The drawer also shuts itself on a route change, but choosing the page the
  // student is already on changes no route.
  const go = (to) => {
    setIsOpen(false);
    drawer.close();
    navigate(to);
  };

  const handleLogout = () => {
    setIsOpen(false);
    drawer.close();
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  /**
   * The account menu's contents, drawn in two frames. As the desktop dropdown
   * it is an ARIA menu. As the drawer it is a dialog holding an ordinary list
   * of buttons — menu roles promise arrow-key movement a dialog does not give
   * — and it marks the page the student is on, since in the drawer these are
   * the only section links on the screen.
   */
  const renderItems = (asMenu) => (
    <>
      <li role={asMenu ? "none" : undefined} className="sd-menu__head">
        {asMenu ? null : <ProfileAvatar src={avatarUrl} name={studentName} size={56} />}
        <p className="sd-menu__name">{studentName}</p>
        <p className="sd-menu__sub">{studentNumber}</p>
      </li>

      {NAV_ITEMS.map((item) => (
        <li role={asMenu ? "none" : undefined} key={item.to}>
          <button
            type="button"
            role={asMenu ? "menuitem" : undefined}
            className="sd-menu__item"
            aria-current={!asMenu && isCurrent(item) ? "page" : undefined}
            onClick={() => go(item.to)}
          >
            <span className="sd-menu__item-icon">
              <item.Icon size={16} />
            </span>
            {item.label}
          </button>
        </li>
      ))}

      <li role={asMenu ? "none" : undefined}>
        <button
          type="button"
          role={asMenu ? "menuitemcheckbox" : "switch"}
          aria-checked={isDarkMode}
          className="sd-menu__item sd-menu__item--toggle"
          // Stays open so the change is visible and easy to flip back.
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

      <li role={asMenu ? "none" : undefined}>
        <button
          type="button"
          role={asMenu ? "menuitem" : undefined}
          className="sd-menu__item sd-menu__item--danger"
          onClick={handleLogout}
        >
          <span className="sd-menu__item-icon">
            <LogoutIcon size={16} />
          </span>
          Log out
        </button>
      </li>
    </>
  );

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

      <nav className="sd-topbar__nav" aria-label="Student sections" ref={pillRef}>
        <span className="sd-topbar__nav-pill" style={pillStyle} aria-hidden="true" />
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
        {drawer.isDrawer ? (
          <button
            type="button"
            className="sd-profile__trigger sd-profile__trigger--menu"
            aria-label={`Menu for ${studentName}`}
            {...drawer.triggerProps}
          >
            <ProfileAvatar src={avatarUrl} name={studentName} size={32} />
            <span className="sd-profile__bars">
              <MenuIcon size={20} />
            </span>
          </button>
        ) : (
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
        )}

        {drawer.isDrawer ? (
          <>
            <div
              className={`sd-scrim${drawer.open ? " is-open" : ""}`}
              onClick={drawer.close}
              aria-hidden="true"
            />
            <div className={`sd-drawer${drawer.open ? " is-open" : ""}`} {...drawer.panelProps}>
              <button
                type="button"
                className="sd-drawer__close"
                onClick={drawer.close}
                aria-label="Close menu"
              >
                <CloseIcon size={18} />
              </button>
              <ul className="sd-menu sd-menu--drawer">{renderItems(false)}</ul>
            </div>
          </>
        ) : isOpen ? (
          <ul className="sd-menu" role="menu">
            {renderItems(true)}
          </ul>
        ) : null}
      </div>
    </header>
  );
}

export default StudentNavBar;
