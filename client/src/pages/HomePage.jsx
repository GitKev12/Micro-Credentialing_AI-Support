import { useEffect, useState } from "react";
import StatusCard from "../components/StatusCard";
import { getHealthStatus } from "../services/api";

function HomePage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadHealth = async () => {
      try {
        const response = await getHealthStatus();

        if (isMounted) {
          setStatus(response);
        }
      } catch (requestError) {
        if (isMounted) {
          setError("API health check failed. Start the Express server and verify the Vite proxy.");
        }
      }
    };

    loadHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="home-grid">
      <article className="panel">
        <h2>What is already configured</h2>
        <ul className="stack-list">
          <li>Workspace-based root package for one-command development.</li>
          <li>React client with Vite, Axios, and React Router.</li>
          <li>Express server with CORS, dotenv, and Mongoose-ready connection logic.</li>
          <li>Folder structure separated for pages, components, services, routes, and controllers.</li>
        </ul>
      </article>

      {error ? (
        <article className="panel error-card">
          <h3>Server Status</h3>
          <p className="error-copy">{error}</p>
        </article>
      ) : (
        <StatusCard status={status} />
      )}

      <article className="panel">
        <h2>Suggested next steps</h2>
        <ol className="task-list">
          <li>Duplicate `server/.env.example` into `server/.env`.</li>
          <li>Point `MONGODB_URI` at your local or hosted MongoDB instance.</li>
          <li>Build your first API resource in `server/src/routes` and `server/src/controllers`.</li>
          <li>Replace the starter dashboard with your capstone features in `client/src/pages`.</li>
        </ol>
      </article>
    </section>
  );
}

export default HomePage;
