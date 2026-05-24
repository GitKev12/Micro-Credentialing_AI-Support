import { useEffect, useState } from "react";
import EntityOverviewPanel from "../../../shared/components/EntityOverviewPanel";
import AdminHighlights from "../components/AdminHighlights";
import { getAdminOverview } from "../services/adminService";

function AdminPage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      try {
        const response = await getAdminOverview();

        if (isMounted) {
          setOverview(response);
        }
      } catch (requestError) {
        if (isMounted) {
          setError("Admin overview could not be loaded from /api/admins/overview.");
        }
      }
    };

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="page-grid">
      <AdminHighlights />
      <EntityOverviewPanel overview={overview} error={error} />
    </section>
  );
}

export default AdminPage;
