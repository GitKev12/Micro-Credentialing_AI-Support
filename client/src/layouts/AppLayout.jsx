import { useLocation } from "react-router-dom";

const authPaths = ["/login", "/admin-login"];

function AppLayout({ children }) {
  const location = useLocation();

  if (authPaths.includes(location.pathname)) {
    return children;
  }

  return <div className="app-shell entity-enter">{children}</div>;
}

export default AppLayout;
