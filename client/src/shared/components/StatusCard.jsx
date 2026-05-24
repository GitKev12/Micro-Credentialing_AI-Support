function StatusCard({ status, error }) {
  if (error) {
    return (
      <article className="panel error-card">
        <h3>Server Status</h3>
        <p className="error-copy">{error}</p>
      </article>
    );
  }

  const state = status?.status ?? "loading";
  const message = status?.message ?? "Waiting for the API health check response.";
  const architecture = status?.architecture ?? "Waiting for server response";
  const entities = status?.availableEntities?.join(", ") ?? "Pending response";
  const timestamp = status?.timestamp
    ? new Date(status.timestamp).toLocaleString()
    : "Pending response";

  return (
    <article className="panel status-card">
      <h3>Server Status</h3>
      <span className="status-badge">{state}</span>
      <p className="entity-copy">{message}</p>
      <dl>
        <dt>Architecture</dt>
        <dd>{architecture}</dd>
        <dt>Entities</dt>
        <dd>{entities}</dd>
        <dt>Last update</dt>
        <dd>{timestamp}</dd>
      </dl>
    </article>
  );
}

export default StatusCard;
