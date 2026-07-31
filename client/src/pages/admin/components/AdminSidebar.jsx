import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { clearAuthSession } from "../../../auth/services/authService";
import {
  AssessorsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CoursesIcon,
  SignOutIcon,
  StudentsIcon,
  TosIcon,
  UserIcon
} from "./icons";

const NAV_ITEMS = [
  { to: "/admin/courses", label: "Courses", Icon: CoursesIcon },
  { to: "/admin/students", label: "Students", Icon: StudentsIcon },
  { to: "/admin/assessors", label: "Assessors", Icon: AssessorsIcon },
  { to: "/admin/table-of-specification", label: "Table of Specification", Icon: TosIcon }
];

const COLLAPSED_KEY = "adminSidebarCollapsed";

function AdminSidebar({ name, idNumber }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSED_KEY) === "1"
  );

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleSignOut = () => {
    clearAuthSession();
    navigate("/admin-login", { replace: true });
  };

  return (
    <aside className={`admin-sidebar${collapsed ? " admin-sidebar--collapsed" : ""}`}>
      <button
        type="button"
        className="admin-sidebar__toggle"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? <ChevronRightIcon size={15} /> : <ChevronLeftIcon size={15} />}
      </button>

      <div className="admin-sidebar__top">
        <div className="admin-sidebar__identity">
          <div className="admin-sidebar__avatar">
            <UserIcon size={78} color="var(--brand)" />
          </div>
          <div className="admin-sidebar__who">
            <span className="admin-sidebar__name">{name}</span>
            <span className="admin-sidebar__id">{idNumber}</span>
          </div>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Admin sections">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `admin-nav-item${isActive ? " is-active" : ""}`
              }
            >
              <Icon size={18} />
              <span className="admin-nav-item__label">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <button
        type="button"
        className="admin-sidebar__signout"
        onClick={handleSignOut}
        title={collapsed ? "Sign Out" : undefined}
      >
        <SignOutIcon size={20} />
        <span>Sign Out</span>
      </button>
    </aside>
  );
}

export default AdminSidebar;
