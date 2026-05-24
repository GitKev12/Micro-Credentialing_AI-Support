function EntityOverviewPanel({ overview, error }) {
  if (error) {
    return (
      <article className="panel error-card">
        <h2>Entity Overview</h2>
        <p className="error-copy">{error}</p>
      </article>
    );
  }

  if (!overview) {
    return (
      <article className="panel">
        <p className="entity-label">Loading Module</p>
        <h2>Fetching entity workspace metadata.</h2>
        <p className="loading-copy">
          The page is waiting for the starter API endpoint to return its overview payload.
        </p>
      </article>
    );
  }

  return (
    <article className="panel">
      <div className="entity-panel-head">
        <div>
          <p className="entity-label">{overview.entity}</p>
          <h2>{overview.focus}</h2>
        </div>
        <span className="status-pill">{overview.model}</span>
      </div>

      <p className="lead-copy">{overview.summary}</p>
      <div className="callout">
        <strong>Starter endpoint:</strong> <code>{overview.routeBase}/overview</code>
      </div>

      <div className="entity-columns">
        <section>
          <h3>Collections</h3>
          <ul className="detail-list">
            {overview.collections.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Dashboard Sections</h3>
          <ul className="detail-list">
            {overview.dashboardSections.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Starter Features</h3>
          <ul className="detail-list">
            {overview.starterFeatures.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

export default EntityOverviewPanel;
