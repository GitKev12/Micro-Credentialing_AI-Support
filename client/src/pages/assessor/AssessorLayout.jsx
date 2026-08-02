import { Outlet } from "react-router-dom";
import AssessorSidebar from "./components/AssessorSidebar";
import { getStoredSession } from "../../auth/services/authService";
import sampleData from "./assessorSampleData.json";
import "./assessor.css";

function AssessorLayout() {
  const session = getStoredSession()?.user;
  const name = session?.displayName || sampleData.assessor.name;
  const idNumber = session?.identifier || sampleData.assessor.idNumber;

  return (
    <div className="assessor-app">
      <AssessorSidebar name={name} idNumber={idNumber} counts={sampleData.summary} />
      <div className="assessor-main">
        <Outlet />
      </div>
    </div>
  );
}

export default AssessorLayout;
