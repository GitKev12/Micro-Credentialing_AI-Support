import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AssessorSidebar from "./components/AssessorSidebar";
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
      <div className="assessor-main">
        <Outlet />
      </div>
    </div>
  );
}

export default AssessorLayout;
