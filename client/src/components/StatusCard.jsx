function StatusCard({ status }) {
  const state = status?.status ?? "loading";
  const message = status?.message ?? "Waiting for the API health check response.";
  const timestamp = status?.timestamp
    ? new Date(status.timestamp).toLocaleString()
    : "Pending response";

  return (
    <article className="panel status-card">
      <h3>Server Status</h3>
      <span className="status-badge">{state}</span>
      <p>{message}</p>
      <dl>
        <dt>Endpoint</dt>
        <dd>/api/health</dd>
        <dt>Last update</dt>
        <dd>{timestamp}</dd>
      </dl>
    </article>
  );
}

export default StatusCard;
