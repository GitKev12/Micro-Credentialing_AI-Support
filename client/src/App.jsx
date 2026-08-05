import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import AdminLayout from "./pages/admin/AdminLayout";
import CourseManagement from "./pages/admin/CourseManagement";
import StudentsManagement from "./pages/admin/StudentsManagement";
import AssessorsManagement from "./pages/admin/AssessorsManagement";
import TableOfSpecification from "./pages/admin/TableOfSpecification";
import AssessorLayout from "./pages/assessor/AssessorLayout";
import ClassesPage from "./pages/assessor/ClassesPage";
import RosterPage from "./pages/assessor/RosterPage";
import QueuePage from "./pages/assessor/QueuePage";
import StudentPage from "./pages/assessor/StudentPage";
import ReviewPage from "./pages/assessor/ReviewPage";
import CredentialsPage from "./pages/assessor/CredentialsPage";
import StudentLayout from "./pages/student/StudentLayout";
import StudentDashboard from "./pages/student/StudentDashboard";
import AchievementsPage from "./pages/student/AchievementsPage";
import StudentCourses from "./pages/student/components/StudentCourses";
import LearningModules from "./pages/student/LearningModules";
import ProtectedRoute from "./auth/components/ProtectedRoute";
import AdminLoginPage from "./auth/pages/AdminLoginPage";
import LoginPage from "./auth/pages/LoginPage";

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRole="student">
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<StudentCourses />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="certifications" element={<AchievementsPage view="certifications" />} />
          <Route path="badges" element={<AchievementsPage view="badges" />} />
          <Route path="courses/:courseId/modules" element={<LearningModules />} />
        </Route>
        <Route
          path="/assessor"
          element={
            <ProtectedRoute allowedRole="assessor">
              <AssessorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/assessor/classes" replace />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="classes/:classId" element={<RosterPage />} />
          <Route path="classes/:classId/students/:studentId" element={<StudentPage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="review/:submissionId" element={<ReviewPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
        </Route>
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin" loginPath="/admin-login">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/courses" replace />} />
          <Route path="courses" element={<CourseManagement />} />
          <Route path="students" element={<StudentsManagement />} />
          <Route path="assessors" element={<AssessorsManagement />} />
          <Route path="table-of-specification" element={<TableOfSpecification />} />
        </Route>
      </Routes>
    </AppLayout>
  );
}

export default App;
