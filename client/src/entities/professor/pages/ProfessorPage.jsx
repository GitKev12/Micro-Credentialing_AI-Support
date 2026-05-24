import { useEffect, useState } from "react";
import EntityOverviewPanel from "../../../shared/components/EntityOverviewPanel";
import ProfessorHighlights from "../components/ProfessorHighlights";
import { getProfessorOverview } from "../services/professorService";

function ProfessorPage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      try {
        const response = await getProfessorOverview();

        if (isMounted) {
          setOverview(response);
        }
      } catch (requestError) {
        if (isMounted) {
          setError("Professor overview could not be loaded from /api/professors/overview.");
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
      <ProfessorHighlights />
      <EntityOverviewPanel overview={overview} error={error} />
    </section>
  );
}

export default ProfessorPage;
