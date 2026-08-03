import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchGradingQueue,
  releaseConfident,
  storedAssessorId,
  timeAgo
} from "../../services/assessors";
import { CheckIcon, ChevronRightIcon } from "./components/icons";
import { Chip, Metric, Person, ScreenHeader, Segmented } from "./components/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "flagged", label: "AI flagged" },
  { key: "confident", label: "High confidence" },
  { key: "manual", label: "Manual grading" }
];

function QueuePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("filter") ?? "all");
  const [queue, setQueue] = useState([]);
  const [counts, setCounts] = useState({ all: 0, flagged: 0, confident: 0, manual: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId) {
      setIsLoading(false);
      return undefined;
    }

    fetchGradingQueue(assessorId)
      .then((data) => {
        if (!active) return;
        setQueue(data?.queue ?? []);
        setCounts(data?.counts ?? { all: 0, flagged: 0, confident: 0, manual: 0 });
      })
      .catch(() => {
        if (active) setQueue([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const options = FILTERS.map((option) => ({
    key: option.key,
    label: `${option.label} · ${counts[option.key] ?? 0}`
  }));

  const visible = useMemo(() => {
    if (filter === "flagged") return queue.filter((row) => row.flags > 0);
    if (filter === "confident") return queue.filter((row) => row.aiStatus === "graded" && row.flags === 0);
    if (filter === "manual") return queue.filter((row) => row.aiStatus === "unavailable");
    return queue;
  }, [filter, queue]);

  const acceptConfident = async () => {
    setReleasing(true);
    try {
      await releaseConfident(storedAssessorId());
      navigate("/assessor/credentials");
    } catch {
      setReleasing(false);
    }
  };

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${counts.all} submission${counts.all === 1 ? "" : "s"} waiting`}
        title="To Grade"
      />

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-3)",
            flexWrap: "wrap",
            marginBottom: "var(--sp-2)"
          }}
        >
          <Segmented
            options={options}
            value={filter}
            onChange={setFilter}
            label="Filter submissions"
          />
          <span style={{ flex: 1 }} />
          {filter !== "manual" && counts.confident > 0 ? (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={releasing}
              onClick={acceptConfident}
            >
              <CheckIcon />
              {releasing ? "Releasing…" : "Accept all high-confidence"}
            </button>
          ) : null}
        </div>

        {visible.map((row) => {
          const isManual = row.aiStatus === "unavailable";

          return (
            <div key={row.id} className="data-row queue-grid">
              <Person name={row.name} sid={row.sid} />

              <div style={{ minWidth: 0 }}>
                <div className="cell-title">{row.assessment}</div>
                <div className="assessor-meta">
                  {row.course} · submitted {timeAgo(row.submittedAt)}
                </div>
              </div>

              <div style={{ marginLeft: "-10px" }}>
                {isManual ? (
                  <Metric label="AI grading" value="N/A" hint="Grade manually" />
                ) : (
                  <Metric
                    label="AI score"
                    value={`${row.ai} / ${row.total}`}
                    hint={`${Math.round(row.ai / row.pointsPerItem)} items correct`}
                  />
                )}
              </div>

              <span style={{ marginLeft: "-10px" }}>
                {isManual ? (
                  <Chip tone="outline">Manual grading needed</Chip>
                ) : (
                  <Chip tone={row.flags ? "brand-soft" : "info"}>
                    {row.flags ? `${row.flags} flagged for review` : "High confidence"}
                  </Chip>
                )}
              </span>

              <button
                type="button"
                className="btn btn--primary"
                style={{ justifySelf: "end" }}
                onClick={() => navigate(`/assessor/review/${row.id}`)}
              >
                Review
                <ChevronRightIcon size={15} />
              </button>
            </div>
          );
        })}

        {visible.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            {isLoading ? "Loading submissions…" : "Nothing in this filter."}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default QueuePage;
