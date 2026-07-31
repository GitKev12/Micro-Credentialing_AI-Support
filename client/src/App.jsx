import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import AdminLayout from "./pages/admin/AdminLayout";
import CourseManagement from "./pages/admin/CourseManagement";
import StudentsManagement from "./pages/admin/StudentsManagement";
import AssessorsManagement from "./pages/admin/AssessorsManagement";
import TableOfSpecification from "./pages/admin/TableOfSpecification";
import AssessorPage from "./pages/assessor/AssessorPage";
import StudentLayout from "./pages/student/StudentLayout";
import StudentDashboard from "./pages/student/StudentDashboard";
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
          <Route path="courses/:courseId/modules" element={<LearningModules />} />
        </Route>
        <Route
          path="/assessor"
          element={
            <ProtectedRoute allowedRole="assessor">
              <AssessorPage />
            </ProtectedRoute>
          }
        />
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
