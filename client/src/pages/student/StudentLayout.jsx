import { Outlet, useMatch } from "react-router-dom";
import StudentNavBar from "./components/StudentNavBar";

function StudentLayout() {
  // Hide the nav bar on the course learning-modules route.
  const isCourseModules = useMatch("/student/courses/:courseId/modules");

  return (
    <div className="student-page">
      {isCourseModules ? null : <StudentNavBar />}
      <Outlet />
    </div>
  );
}

export default StudentLayout;
