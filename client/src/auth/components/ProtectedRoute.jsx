import { Navigate, useLocation } from "react-router-dom";
import { getStoredSession } from "../services/authService";

function ProtectedRoute({ allowedRole, children, loginPath = "/login" }) {
  const location = useLocation();
  const session = getStoredSession();

  if (!session?.user) {
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  if (session.user.role !== allowedRole) {
    return <Navigate to={session.redirectTo || `/${session.user.role}`} replace />;
  }

  return children;
}

export default ProtectedRoute;
