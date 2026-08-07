import { useLocation } from "react-router-dom";

const authPaths = ["/login", "/admin-login"];
// Full-screen consoles render their own edge-to-edge shell and opt out of
// the centred, max-width .app-shell (see assessor.css's .assessor-app and
// admin.css's .admin-app).
const fullBleedPrefixes = ["/assessor", "/admin"];

function AppLayout({ children }) {
  const location = useLocation();

  if (authPaths.includes(location.pathname)) {
    return children;
  }

  if (fullBleedPrefixes.some((prefix) => location.pathname.startsWith(prefix))) {
    return children;
  }

  return <div className="app-shell entity-enter">{children}</div>;
}

export default AppLayout;
