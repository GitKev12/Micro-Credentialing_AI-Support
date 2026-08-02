import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./components/AdminSidebar";
import { getStoredSession } from "../../auth/services/authService";
import { fetchAdminProfile } from "../../services/admin";
import "./admin.css";

function AdminLayout() {
  const session = getStoredSession()?.user;
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;

    fetchAdminProfile()
      .then((admin) => {
        if (active) setProfile(admin);
      })
      .catch(() => {
        // Fall back to the signed-in session below.
      });

    return () => {
      active = false;
    };
  }, []);

  const name = profile?.name || session?.displayName || "Administrator";
  const idNumber = profile?.idNumber || session?.identifier || "";

  return (
    <div className="admin-app">
      <AdminSidebar name={name} idNumber={idNumber} />
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
