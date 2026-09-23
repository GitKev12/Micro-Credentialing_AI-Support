import { useLocation } from "react-router-dom";
import SessionStanding from "../auth/components/SessionStanding";

const authPaths = ["/login"];
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
 * has been suspended, and `.app-shell` carries .entity-enter. That animation
 * used to be filled `both`, leaving a transform standing for the life of the
 * page that became the containing block for anything fixed within it. It is
 * filled `backwards` now (see styles.css), but an overlay that has to cover
 * the screen is still safest outside every animated box.
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
