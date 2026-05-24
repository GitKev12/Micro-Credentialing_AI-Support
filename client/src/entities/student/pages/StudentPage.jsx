import { useEffect, useState } from "react";
import EntityOverviewPanel from "../../../shared/components/EntityOverviewPanel";
import StudentHighlights from "../components/StudentHighlights";
import { getStudentOverview } from "../services/studentService";

function StudentPage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      try {
        const response = await getStudentOverview();

        if (isMounted) {
          setOverview(response);
        }
      } catch (requestError) {
        if (isMounted) {
          setError("Student overview could not be loaded from /api/students/overview.");
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
      <StudentHighlights />
      <EntityOverviewPanel overview={overview} error={error} />
    </section>
  );
}

export default StudentPage;
