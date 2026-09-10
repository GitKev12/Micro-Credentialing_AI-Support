import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AssessorSidebar from "./components/AssessorSidebar";
import { ScreenSkeleton } from "./components/ui";
import { getStoredSession } from "../../auth/services/authService";
import { fetchAssessorOverview, storedAssessorId } from "../../services/assessors";
import "./assessor.css";

function AssessorLayout() {
  const session = getStoredSession()?.user;
  // Refetch on navigation so the "Generate Assessment" badge tracks postings.
  const { pathname } = useLocation();
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId) return undefined;

    fetchAssessorOverview(assessorId)
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [pathname]);

  const name = overview?.assessor?.name || session?.displayName || "Assessor";
  const idNumber = overview?.assessor?.idNumber || session?.identifier || "";

  return (
    <div className="assessor-app entity-enter">
      <AssessorSidebar name={name} idNumber={idNumber} counts={overview?.summary} />
      {/* Each screen is its own download, so the rail stays put and only the
          page it points at waits — the console's own shapes this time, since
          by now its stylesheet has arrived with the layout. */}
      <div className="assessor-main">
        <Suspense fallback={<ScreenSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

export default AssessorLayout;
