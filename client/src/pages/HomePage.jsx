import { useEffect, useState } from "react";
import EntityDirectoryCard from "../shared/components/EntityDirectoryCard";
import StatusCard from "../shared/components/StatusCard";
import { getHealthStatus, getSystemOverview } from "../shared/services/api";

const fallbackEntities = [
  {
    name: "Student",
    clientRoute: "/student",
    apiPath: "/api/students/overview",
    modulePath: "server/src/modules/student",
    focus: "Learner records, adviser assignments, and capstone milestone submissions."
  },
  {
    name: "Professor",
    clientRoute: "/professor",
    apiPath: "/api/professors/overview",
    modulePath: "server/src/modules/professor",
    focus: "Faculty advising, panel responsibilities, and evaluation workflows."
  },
  {
    name: "Admin",
    clientRoute: "/admin",
    apiPath: "/api/admins/overview",
    modulePath: "server/src/modules/admin",
    focus: "Program governance, user oversight, and reporting operations."
  }
];

function HomePage() {
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const [healthResponse, overviewResponse] = await Promise.all([
          getHealthStatus(),
          getSystemOverview()
        ]);

        if (isMounted) {
          setStatus(healthResponse);
          setOverview(overviewResponse);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            "The API overview could not be loaded. Start the Express server and verify the Vite proxy."
          );
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const entities = overview?.entities ?? fallbackEntities;

  return (
    <section className="home-grid">
      <article className="panel home-hero">
        <p className="entity-label">Entity Directory</p>
        <h2>Each study actor now has its own client workspace and backend module.</h2>
        <p className="lead-copy">
          The starter structure now mirrors your study directly: separate paths for Student,
          Professor, and Admin on both the React app and the Express API.
        </p>
        <div className="entity-grid">
          {entities.map((entity) => (
            <EntityDirectoryCard key={entity.name} entity={entity} />
          ))}
        </div>
      </article>

      <StatusCard status={status} error={error} />

      <article className="panel">
        <h3>Updated backend shape</h3>
        <ul className="stack-list">
          <li>`server/src/modules/student` holds student model, controller, and routes.</li>
          <li>`server/src/modules/professor` holds professor model, controller, and routes.</li>
          <li>`server/src/modules/admin` holds admin model, controller, and routes.</li>
          <li>`server/src/modules/overview` exposes the project structure to the client.</li>
        </ul>
      </article>

      <article className="panel">
        <h3>Suggested next steps</h3>
        <ol className="task-list">
          <li>Expand each Mongoose schema with the real fields from your capstone study.</li>
          <li>Replace the overview endpoints with database-backed services.</li>
          <li>Connect each role page to real CRUD screens and protected routes.</li>
          <li>Add authentication rules that separate student, professor, and admin access.</li>
        </ol>
      </article>
    </section>
  );
}

export default HomePage;
