import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import AdminPage from "./pages/admin/AdminPage";
import AssessorPage from "./pages/assessor/AssessorPage";
import StudentPage from "./pages/student/StudentPage";
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
              <StudentPage />
            </ProtectedRoute>
          }
        />
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
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AppLayout>
  );
}

export default App;
