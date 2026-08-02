import { useState } from "react";
import { useNavigate } from "react-router-dom";
import data from "./assessorSampleData.json";
import { CheckIcon } from "./components/icons";
import { Chip, Metric, Person, ScreenHeader } from "./components/ui";

function CredentialsPage() {
  const navigate = useNavigate();
  const [issued, setIssued] = useState({});

  const issue = (id) => setIssued((current) => ({ ...current, [id]: true }));

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${data.classes[0].code} · ${data.pendingCredentials.length} awaiting release`}
        title="Credential Approval"
      />

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        <p
          className="explainer__body"
          style={{ maxWidth: "48rem", marginBottom: "var(--sp-2)" }}
        >
          {data.copy.credentialsIntro}
        </p>

        {data.pendingCredentials.map((row) => (
          <div key={row.id} className="data-row creds-grid">
            <Person name={row.name} sid={row.sid} />

            <div style={{ minWidth: 0 }}>
              <div className="cell-title">{row.cred}</div>
              <div className="assessor-meta">{row.module}</div>
            </div>

            <Metric label="Final" value={row.score} />

            <span>
              <Chip tone="info">{row.source}</Chip>
            </span>

            <span style={{ justifySelf: "end" }}>
              {issued[row.id] ? (
                <span className="btn btn--ghost" role="status">
                  <CheckIcon />
                  Issued today
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => issue(row.id)}
                >
                  Approve &amp; issue
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export default CredentialsPage;
