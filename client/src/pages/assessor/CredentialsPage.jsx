import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPendingCredentials,
  issueCredential,
  storedAssessorId
} from "../../services/assessors";
import { CheckIcon } from "./components/icons";
import { Chip, Metric, Person, ScreenHeader } from "./components/ui";

const CREDENTIALS_INTRO =
  "Nothing here has been awarded yet. The AI's score is only a suggestion — approving it is what puts the credential on the student's record.";

function CredentialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [issued, setIssued] = useState({});
  const [issuing, setIssuing] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId) {
      setIsLoading(false);
      return undefined;
    }

    fetchPendingCredentials(assessorId)
      .then((list) => {
        if (active) setRows(list);
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const issue = async (id) => {
    setIssuing((current) => ({ ...current, [id]: true }));
    try {
      await issueCredential(storedAssessorId(), id);
      setIssued((current) => ({ ...current, [id]: true }));
    } catch {
      // Leave the button available so the assessor can retry.
    } finally {
      setIssuing((current) => ({ ...current, [id]: false }));
    }
  };

  const awaitingCount = rows.filter((row) => !issued[row.id]).length;

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${awaitingCount} awaiting release`}
        title="Credential Approval"
      />

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        <p
          className="explainer__body"
          style={{ maxWidth: "48rem", marginBottom: "var(--sp-2)" }}
        >
          {CREDENTIALS_INTRO}
        </p>

        {rows.map((row) => (
          <div key={row.id} className="data-row creds-grid">
            <Person name={row.name} sid={row.sid} />

            <div style={{ minWidth: 0 }}>
              <div className="cell-title">{row.credential}</div>
              <div className="assessor-meta">
                {row.courseCode} · {row.assessmentTitle}
              </div>
            </div>

            <Metric label="Final" value={`${row.finalScore}/${row.totalPoints}`} />

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
                  disabled={Boolean(issuing[row.id])}
                  onClick={() => issue(row.id)}
                >
                  {issuing[row.id] ? "Issuing…" : "Approve & issue"}
                </button>
              )}
            </span>
          </div>
        ))}

        {rows.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            {isLoading ? "Loading credentials…" : "No credentials are waiting for approval."}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default CredentialsPage;
