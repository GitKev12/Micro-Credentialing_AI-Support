import { useLocation, useNavigate } from "react-router-dom";
import { clearAuthSession, getStoredSession } from "../../../auth/services/authService";
import { getInitials, resolveAvatarUrl } from "../../../services/avatar";
import { BadgeIcon, CertificateIcon, DashboardIcon, LogoutIcon } from "./icons";

/**
 * Identity + navigation rail beside the dashboard.
 *
 * The placeholder is drawn from the student's own initials rather than a
 * generic silhouette, so an account with no photo still looks like an
 * account rather than a missing asset.
 */
function initialsAvatar(name) {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="#f3e3e3"/>
        <text x="100" y="100" font-family="Poppins, Segoe UI, sans-serif" font-size="76"
          font-weight="600" fill="#a00e18" text-anchor="middle" dominant-baseline="central"
        >${getInitials(name)}</text>
      </svg>`
    )
  );
}

/**
 * The rail moves between the views that share it. Course navigation is not
 * one of them — the top bar owns "My Courses", and repeating it here made the
 * rail look like the app's primary nav when it is only the dashboard's.
 */
const NAV_ITEMS = [
  { to: "/student/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { to: "/student/certifications", label: "Certification", Icon: CertificateIcon },
  { to: "/student/badges", label: "Badges", Icon: BadgeIcon }
];

function StudentSidebar({ summary = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const student = getStoredSession()?.user;

  const studentName = student?.displayName || "Student";
  // The login response returns the student number as `identifier`.
  const studentNumber =
    student?.studentNumber || student?.studentNo || student?.identifier || "—";
  const avatarUrl = resolveAvatarUrl(student) || initialsAvatar(studentName);

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="sd-rail" aria-label="Your profile">
      <div className="sd-rail__identity">
        <img
          className="sd-rail__avatar"
          src={avatarUrl}
          alt={`${studentName}'s profile photo`}
        />
        <p className="sd-rail__name">{studentName}</p>
        <p className="sd-rail__number">{studentNumber}</p>
        <span className="sd-rail__role">Student</span>
      </div>

      <nav className="sd-rail__nav" aria-label="Student sections">
        {NAV_ITEMS.map((item) => {
          // Each tab is a leaf route, so an exact match is the whole story.
          const current = location.pathname === item.to;

          return (
            <button
              key={item.to}
              type="button"
              className="sd-rail__link"
              aria-current={current ? "page" : undefined}
              onClick={() => navigate(item.to)}
            >
              <item.Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {summary.length ? (
        <dl className="sd-rail__summary">
          {summary.map((row) => (
            <div className="sd-rail__summary-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd className="sd-rail__summary-value">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <button type="button" className="sd-rail__logout" onClick={handleLogout}>
        <LogoutIcon size={17} />
        Log out
      </button>
    </aside>
  );
}

export default StudentSidebar;
