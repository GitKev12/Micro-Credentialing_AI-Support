import StudentNavBar from "./components/StudentNavBar";
import StudentCourses from "./components/StudentCourses";

function StudentPage() {
  return (
    <div className="student-page">
      <StudentNavBar />
      <StudentCourses />
    </div>
  );
}

export default StudentPage;
