import { useLocation } from "react-router-dom";
import SessionStanding from "../auth/components/SessionStanding";

const authPaths = ["/login", "/admin-login"];
// Full-screen consoles render their own edge-to-edge shell and opt out of
// the centred, max-width .app-shell (see assessor.css's .assessor-app and
// admin.css's .admin-app).
const fullBleedPrefixes = ["/assessor", "/admin"];

function shellFor(pathname, children) {
  if (authPaths.includes(pathname)) return children;
  if (fullBleedPrefixes.some((prefix) => pathname.startsWith(prefix))) return children;

  return <div className="app-shell entity-enter">{children}</div>;
}

/**
 * `SessionStanding` is a sibling of the shell rather than something inside it,
 * on every route. It draws a fixed overlay when the account behind this session
 * has been suspended, and `.app-shell` carries .entity-enter — an animation
 * filled `both`, so its transform stands for the life of the page and would
 * become the containing block for anything fixed within it. The same trap the
 * blueprint dialog portals out of (see assessor/components/tos/TosModal.jsx).
 *
 * It renders on the login routes too, where it does nothing: there is no
 * session to watch, and nobody to tell.
 */
function AppLayout({ children }) {
  const location = useLocation();

  return (
    <>
      <SessionStanding />
      {shellFor(location.pathname, children)}
    </>
  );
}

export default AppLayout;
