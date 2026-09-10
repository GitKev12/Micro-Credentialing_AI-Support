import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import AdminLayout from "./pages/admin/AdminLayout";
import CourseManagement from "./pages/admin/CourseManagement";
import StudentsManagement from "./pages/admin/StudentsManagement";
import AssessorsManagement from "./pages/admin/AssessorsManagement";
import ClassesManagement from "./pages/admin/ClassesManagement";
import StudentLayout from "./pages/student/StudentLayout";
import StudentDashboard from "./pages/student/StudentDashboard";
import AchievementsPage from "./pages/student/AchievementsPage";
import StudentCourses from "./pages/student/components/StudentCourses";
import LearningModules from "./pages/student/LearningModules";
import ProtectedRoute from "./auth/components/ProtectedRoute";
import AdminLoginPage from "./auth/pages/AdminLoginPage";
import LoginPage from "./auth/pages/LoginPage";
import { SkeletonText } from "./components/Skeleton";

/**
 * The assessor console, fetched when somebody goes to it.
 *
 * It is a console of its own — eight screens and a stylesheet the size of the
 * other two put together — and nobody but an assessor ever opens it. Loading
 * it with the login page made every student and every admin download the whole
 * of it to reach a screen they will never see.
 *
 * The layout goes with the pages deliberately: the stylesheet is imported by
 * the layout, so leaving that behind would keep the largest part of the weight
 * in the first download and split off only the markup.
 */
const AssessorLayout = lazy(() => import("./pages/assessor/AssessorLayout"));
const ClassesPage = lazy(() => import("./pages/assessor/ClassesPage"));
const RosterPage = lazy(() => import("./pages/assessor/RosterPage"));
const GeneratePage = lazy(() => import("./pages/assessor/GeneratePage"));
const GenerateCoursePage = lazy(() => import("./pages/assessor/GenerateCoursePage"));
const StudentPage = lazy(() => import("./pages/assessor/StudentPage"));
const ResultsPage = lazy(() => import("./pages/assessor/ResultsPage"));
const CredentialsPage = lazy(() => import("./pages/assessor/CredentialsPage"));

/**
 * What stands in while the console itself is being fetched.
 *
 * Deliberately plain: the assessor stylesheet is part of what is still loading,
 * so anything shaped like one of its screens would be drawn unstyled. Once the
 * layout is in, its own Suspense takes over with a skeleton that does know what
 * the console looks like.
 */
function ConsoleBoot() {
  return (
    <div style={{ padding: "30px 36px" }}>
      <SkeletonText lines={4} label="Loading the assessor console…" />
    </div>
  );
}

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
              <Suspense fallback={<ConsoleBoot />}>
                <AssessorLayout />
              </Suspense>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/assessor/classes" replace />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="classes/:courseId" element={<RosterPage />} />
          <Route path="classes/:courseId/students/:studentId" element={<StudentPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="generate/:courseId" element={<GenerateCoursePage />} />
          <Route path="results" element={<ResultsPage />} />
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
          <Route path="classes" element={<ClassesManagement />} />
          <Route path="students" element={<StudentsManagement />} />
          <Route path="assessors" element={<AssessorsManagement />} />
        </Route>
      </Routes>
    </AppLayout>
  );
}

export default App;
