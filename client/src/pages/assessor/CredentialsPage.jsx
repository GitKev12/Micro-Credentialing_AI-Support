import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPendingCredentials,
  issueCredential,
  storedAssessorId
} from "../../services/assessors";
import { noticeClass, useNotice } from "../../lib/useNotice";
import { CheckIcon } from "./components/icons";
import { Chip, Metric, Person, ScreenHeader } from "./components/ui";
import { SkeletonText } from "../../components/Skeleton";

function CredentialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [issued, setIssued] = useState({});
  const [issuing, setIssuing] = useState({});
  const [notice, setNotice] = useNotice();
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

  const issue = async (row) => {
    setIssuing((current) => ({ ...current, [row.id]: true }));
    try {
      await issueCredential(storedAssessorId(), row.id);
      setIssued((current) => ({ ...current, [row.id]: true }));
      // Nothing is said on the way through: the row itself turns into
      // "Issued today", and a message repeating that would only be in the
      // way. A standing failure from an earlier try is cleared, though — it
      // is no longer true of this student.
      setNotice(null);
    } catch {
      // The button is left as it was so the release can be tried again. On
      // its own that read as a button that does nothing: the assessor pressed
      // it, the screen did not move, and there was no way to tell a refusal
      // from a slow network. The failure has to say it failed.
      setNotice({
        tone: "error",
        text: `Couldn't issue ${row.name}'s credential. Try again.`
      });
    } finally {
      setIssuing((current) => ({ ...current, [row.id]: false }));
    }
  };

  const awaitingCount = rows.filter((row) => !issued[row.id]).length;

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${awaitingCount} awaiting release`}
        title="Credentials"
      />

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        {notice ? (
          <p
            className={noticeClass(notice, `assessor-notice assessor-notice--${notice.tone}`)}
            role="status"
          >
            {notice.text}
          </p>
        ) : null}

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
                  onClick={() => issue(row)}
                >
                  {issuing[row.id] ? "Issuing…" : "Issue credential"}
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
              "No credentials are waiting for release."
            )}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default CredentialsPage;
