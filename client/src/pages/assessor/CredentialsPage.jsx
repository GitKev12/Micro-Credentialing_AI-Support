import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPendingCredentials,
  issueCredential,
  storedAssessorId
} from "../../services/assessors";
import { CheckIcon } from "./components/icons";
import { Chip, Metric, Person, ScreenHeader } from "./components/ui";
import { SkeletonText } from "../../components/Skeleton";

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
        {rows.map((row) => (
          <div key={row.id} className="data-row creds-grid">
            <Person name={row.name} sid={row.sid} />

            <div style={{ minWidth: 0 }}>
              <div className="cell-title">{row.credential}</div>
              <div className="assessor-meta">
                {row.courseCode} · {row.assessmentTitle}
              </div>
            </div>

            <Metric label="Score" value={`${row.score}/${row.totalPoints}`} />

            {/* What the pass was measured against. The score alone does not say
                whether it was a near miss or a clear one, and that is the whole
                question in front of the assessor here. */}
            <span>
              <Chip tone="info">Passed · {row.passMark} to pass</Chip>
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
            {isLoading ? (
              <SkeletonText lines={4} label="Loading credentials…" />
            ) : (
              "No credentials are waiting for approval."
            )}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default CredentialsPage;
