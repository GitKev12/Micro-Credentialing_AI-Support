import { NavLink } from "react-router-dom";

const navigationLinks = [
  { to: "/", label: "Overview" },
  { to: "/student", label: "Student" },
  { to: "/professor", label: "Professor" },
  { to: "/admin", label: "Admin" }
];

function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="brand-kicker">Capstone Project Dev</p>
          <h1 className="brand-title">Entity-first MERN workspace for Student, Professor, and Admin flows.</h1>
          <p className="brand-copy">
            The frontend and backend are now organized around your three core study actors so
            screens, API routes, and models stay aligned as the capstone grows.
          </p>
        </div>
        <div className="status-pill">Student + Professor + Admin</div>
        <nav className="nav-bar" aria-label="Primary navigation">
          {navigationLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-body">{children}</main>
    </div>
  );
}

export default AppLayout;
