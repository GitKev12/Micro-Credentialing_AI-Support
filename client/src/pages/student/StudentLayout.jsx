import { Outlet } from "react-router-dom";
import StudentNavBar from "./components/StudentNavBar";

function StudentLayout() {
  return (
    <div className="student-page">
      <StudentNavBar />
      <Outlet />
    </div>
  );
}

export default StudentLayout;
