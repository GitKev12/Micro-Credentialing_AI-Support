import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthSession, getStoredSession } from "../../../auth/services/authService";
import { resolveAvatarUrl } from "../../../services/avatar";
import { THEMES, getStoredTheme, toggleTheme } from "../../../services/theme";
import ProfileAvatar from "./ProfileAvatar";

function StudentNavBar() {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme);
  const isDarkMode = theme === THEMES.DARK;

  const session = getStoredSession();
  const student = session?.user;
  const studentName = student?.displayName || student?.identifier || "Student";
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

  const goToCourses = () => {
    setIsOpen(false);
    navigate("/student");
  };

  const goToDashboard = () => {
    setIsOpen(false);
    navigate("/student/dashboard");
  };

  const handleToggleTheme = () => {
    // Keep the menu open so the change is visible and easy to flip back.
    setTheme(toggleTheme());
  };

  const handleLogout = () => {
    setIsOpen(false);
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  return (
    <header className="student-nav">
      <p className="student-nav__welcome">
        Welcome! <span>{studentName}</span>
      </p>

      <div className="student-nav__profile-menu" ref={menuRef}>
        <button
          type="button"
          className="student-nav__profile"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <span className="student-nav__profile-label">Your Profile</span>
          <ProfileAvatar src={avatarUrl} name={studentName} />
        </button>

        {isOpen ? (
          <ul className="student-nav__dropdown" role="menu">
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="student-nav__dropdown-item"
                onClick={goToCourses}
              >
                My Courses
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="student-nav__dropdown-item"
                onClick={goToDashboard}
              >
                Dashboard
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isDarkMode}
                className="student-nav__dropdown-item student-nav__dropdown-item--toggle"
                onClick={handleToggleTheme}
              >
                <span>Dark Mode</span>
                <span
                  className={`theme-switch${isDarkMode ? " is-on" : ""}`}
                  aria-hidden="true"
                >
                  <span className="theme-switch__thumb" />
                </span>
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="student-nav__dropdown-item student-nav__dropdown-item--danger"
                onClick={handleLogout}
              >
                Logout
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </header>
  );
}

export default StudentNavBar;
