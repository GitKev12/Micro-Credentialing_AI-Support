import { Link } from "react-router-dom";

function EntityDirectoryCard({ entity }) {
  return (
    <article className="panel entity-card">
      <p className="entity-label">{entity.name}</p>
      <h3>{entity.focus}</h3>
      <dl>
        <dt>Client</dt>
        <dd>{entity.clientRoute}</dd>
        <dt>API</dt>
        <dd>{entity.apiPath}</dd>
        <dt>Module</dt>
        <dd>{entity.modulePath}</dd>
      </dl>
      <Link className="entity-link" to={entity.clientRoute}>
        Open {entity.name}
      </Link>
    </article>
  );
}

export default EntityDirectoryCard;
