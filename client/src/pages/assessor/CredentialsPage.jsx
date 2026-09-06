import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPendingCredentials,
  issueCredential,
  storedAssessorId
} from "../../services/assessors";
import { noticeClass, useNotice } from "../../lib/useNotice";
import { CheckIcon } from "./components/icons";
import { Chip, LoadFailed, Person, ScreenHeader } from "./components/ui";
import { SkeletonText } from "../../components/Skeleton";

function CredentialsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [issued, setIssued] = useState({});
  const [issuing, setIssuing] = useState({});
  const [notice, setNotice] = useNotice();
  const [isLoading, setIsLoading] = useState(true);
  // A read that did not come back, and the counter that asks for it again.
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
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
        if (!active) return;
        setRows([]);
        setFailed(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reload]);

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

        <div className="assessor-table-wrap">
          <table className="assessor-table assessor-table--creds">
            <caption className="assessor-sr-only">
              Passed finals whose credential has not been released yet, with the
              score each was passed on and the mark it was passed against.
            </caption>

            <thead>
              <tr>
                <th scope="col">Student #</th>
                <th scope="col">Student</th>
                <th scope="col">Credential</th>
                <th scope="col">Score</th>
                <th scope="col">Result</th>
                <th scope="col">
                  <span className="assessor-sr-only">Release</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="assessor-table__num">
                    {row.sid || <span className="assessor-table__dash">—</span>}
                  </td>

                  <th scope="row">
                    <Person as="span" name={row.name} />
                  </th>

                  <td className="assessor-table__paper">
                    <span className="assessor-table__name">{row.credential}</span>
                    <span className="assessor-table__sub">
                      {row.courseCode} · {row.assessmentTitle}
                    </span>
                  </td>

                  <td className="assessor-table__num">
                    {row.score}/{row.totalPoints}
                  </td>

                  {/* What the pass was measured against. The score alone does not
                      say whether it was a near miss or a clear one, and that is
                      the whole question in front of the assessor here. */}
                  <td>
                    <Chip tone="info">Passed · {row.passMark} to pass</Chip>
                  </td>

                  <td className="assessor-table__open">
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
                  </td>
                </tr>
              ))}

              {isLoading ? (
                <tr>
                  <td className="assessor-table__empty" colSpan={6}>
                    <SkeletonText lines={4} label="Loading credentials…" />
                  </td>
                </tr>
              ) : null}

              {!isLoading && rows.length === 0 ? (
                <tr>
                  <td className="assessor-table__empty" colSpan={6}>
                    {failed ? (
                      <LoadFailed
                        what="The credentials queue"
                        onRetry={() => setReload((n) => n + 1)}
                      />
                    ) : (
                      "No credentials are waiting for release."
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default CredentialsPage;
