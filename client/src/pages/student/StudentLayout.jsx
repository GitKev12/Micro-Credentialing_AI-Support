import { Outlet, useMatch } from "react-router-dom";
import StudentNavBar from "./components/StudentNavBar";
import "./student.css";

function StudentLayout() {
  // Hide the nav bar on the course learning-modules route.
  const isCourseModules = useMatch("/student/courses/:courseId/modules");

  return (
    <div className="student-page student-app">
      {isCourseModules ? null : <StudentNavBar />}
      <Outlet />
    </div>
  );
}

export default StudentLayout;
