import { Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import AdminPage from "./entities/admin/pages/AdminPage";
import ProfessorPage from "./entities/professor/pages/ProfessorPage";
import StudentPage from "./entities/student/pages/StudentPage";
import HomePage from "./pages/HomePage";

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/professor" element={<ProfessorPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
