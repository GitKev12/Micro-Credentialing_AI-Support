import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import data from "./assessorSampleData.json";
import { CheckIcon, ChevronRightIcon } from "./components/icons";
import { Chip, Metric, Person, ScreenHeader, Segmented } from "./components/ui";

function QueuePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("filter") ?? "all");

  const { queue, queueFilters, review, classes } = data;
  const course = classes[0];

  const options = queueFilters.map((option) => ({
    key: option.key,
    label: `${option.label} · ${option.count}`
  }));

  const visible = useMemo(() => {
    if (filter === "flagged") return queue.filter((row) => row.flags > 0);
    if (filter === "confident") return queue.filter((row) => row.flags === 0);
    return queue;
  }, [filter, queue]);

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${course.code} · ${data.summary.toGrade} submissions waiting`}
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
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate("/assessor/credentials")}
          >
            <CheckIcon />
            Accept all high-confidence
          </button>
        </div>

        {visible.map((row) => (
          <div key={row.id} className="data-row queue-grid">
            <Person name={row.name} sid={row.sid} />

            <div style={{ minWidth: 0 }}>
              <div className="cell-title">{row.assessment}</div>
              <div className="assessor-meta">
                {row.course} · submitted {row.when}
              </div>
            </div>

            <Metric
              label="AI score"
              value={`${row.ai} / ${review.total}`}
              hint={`${Math.round(row.ai / review.pointsPerItem)} of ${review.items.length} correct`}
            />

            <span>
              <Chip tone={row.flags ? "brand-soft" : "info"}>
                {row.flags ? `${row.flags} flagged for review` : "High confidence"}
              </Chip>
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
        ))}

        {visible.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            Nothing in this filter.
          </p>
        ) : null}
      </div>
    </>
  );
}

export default QueuePage;
