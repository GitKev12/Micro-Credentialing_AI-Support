import { useNavigate } from "react-router-dom";
import { clearAuthSession, getStoredSession } from "../../../auth/services/authService";
import { resolveAvatarUrl } from "../../../services/avatar";

// Placeholder avatar shown until a real GridFS-backed photo is wired up.
// Inline SVG silhouette so it always renders (no external asset needed).
const PLACEHOLDER_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#e9edf5"/>
      <circle cx="100" cy="78" r="38" fill="#b9c2d6"/>
      <path d="M28 186c0-40 33-64 72-64s72 24 72 64" fill="#b9c2d6"/>
    </svg>`
  );

function StudentSidebar() {
  const navigate = useNavigate();
  const student = getStoredSession()?.user;
  const studentName = student?.displayName || "Student Name";
  // The login response returns the student number as `identifier`.
  const studentNumber =
    student?.studentNumber || student?.studentNo || student?.identifier || "—";
  const avatarUrl = resolveAvatarUrl(student) || PLACEHOLDER_AVATAR;

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="student-sidebar">
      <img
        className="student-sidebar__avatar"
        src={avatarUrl}
        alt={`${studentName}'s profile photo`}
      />
      <p className="student-sidebar__name">{studentName}</p>
      <p className="student-sidebar__number">{studentNumber}</p>

      <button
        type="button"
        className="student-sidebar__logout"
        onClick={handleLogout}
      >
        <svg
          className="student-sidebar__logout-icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>Logout</span>
      </button>
    </aside>
  );
}

export default StudentSidebar;
