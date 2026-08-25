import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchGradingQueue,
  releaseConfident,
  storedAssessorId,
  timeAgo
} from "../../services/assessors";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "./components/icons";
import { Chip, Metric, Person, ScreenHeader, Segmented } from "./components/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "flagged", label: "AI flagged" },
  { key: "confident", label: "Ready to release" },
  { key: "manual", label: "Manual grading" }
];

/**
 * Work that cannot be released as it stands: the AI could not mark it, or it
 * marked some items but flagged others. Both need an assessor to read the paper,
 * which is what sorts a student to the top of the queue.
 */
const needsAttention = (row) => row.aiStatus === "unavailable" || row.flags > 0;

const isFinal = (row) => row.scope === "final";

const countLabel = (count, noun) =>
  `${count} ${noun}${count === 1 ? "" : noun.endsWith("z") ? "zes" : "s"}`;

/**
 * The queue, grouped by the student who sat the papers.
 *
 * A flat list was one row per submission, so a class of thirty sitting eight
 * quizzes was 240 rows with each student's name repeated through it, and no way
 * to see that four of one student's papers were waiting. Grading is done per
 * student — you read someone's work, then decide — so the student is the unit
 * the screen is built from.
 *
 * Ordering within a group puts finals first: a final is what issues the course
 * credential, so it is the paper with something waiting on it.
 */
function groupByStudent(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!groups.has(row.studentId)) {
      groups.set(row.studentId, {
        studentId: row.studentId,
        name: row.name,
        sid: row.sid,
        rows: []
      });
    }
    groups.get(row.studentId).rows.push(row);
  }

  return [...groups.values()]
    .map((group) => {
      const rows = [...group.rows].sort((a, b) => {
        if (isFinal(a) !== isFinal(b)) return isFinal(a) ? -1 : 1;
        return new Date(a.submittedAt ?? 0) - new Date(b.submittedAt ?? 0);
      });

      return {
        ...group,
        rows,
        attention: rows.filter(needsAttention).length,
        finals: rows.filter(isFinal).length,
        quizzes: rows.filter((row) => !isFinal(row)).length,
        // The group's place in the queue is set by its oldest paper — waiting
        // longest is what "next" means on a grading queue.
        waitingSince: rows.reduce(
          (oldest, row) => Math.min(oldest, new Date(row.submittedAt ?? 0).getTime()),
          Number.POSITIVE_INFINITY
        )
      };
    })
    .sort((a, b) => {
      // Students with work the AI could not settle come first — that is the
      // queue's real backlog. Everything else is ordered by the wait.
      if ((a.attention > 0) !== (b.attention > 0)) return a.attention > 0 ? -1 : 1;
      return a.waitingSince - b.waitingSince;
    });
}

/** One submission inside a student's group. */
function QueueRow({ row, onReview }) {
  const isManual = row.aiStatus === "unavailable";
  const passed = row.ai != null && row.passMark != null && row.ai >= row.passMark;

  return (
    <div className="data-row queue-grid queue-grid--grouped">
      <div style={{ minWidth: 0 }}>
        <div className="cell-title">
          {row.assessment}
          <Chip tone={isFinal(row) ? "brand-soft" : "outline"}>
            {isFinal(row) ? "Final exam" : "Lesson quiz"}
          </Chip>
        </div>
        <div className="assessor-meta">
          {row.course} · submitted {timeAgo(row.submittedAt)}
        </div>
      </div>

      {isManual ? (
        <Metric label="AI grading" value="N/A" hint="Grade manually" />
      ) : (
        <Metric
          label="AI score"
          value={`${row.ai} / ${row.total}`}
          hint={
            row.passMark != null
              ? `${passed ? "passes" : "below"} ${row.passMark}`
              : `${Math.round(row.ai / row.pointsPerItem)} items correct`
          }
        />
      )}

      <span>
        {isManual ? (
          <Chip tone="outline">Manual grading needed</Chip>
        ) : (
          <Chip tone={row.flags ? "brand-soft" : "info"}>
            {row.flags ? `${row.flags} flagged for review` : "Ready to release"}
          </Chip>
        )}
      </span>

      <button
        type="button"
        className="btn btn--primary"
        style={{ justifySelf: "end" }}
        onClick={() => onReview(row.id)}
      >
        Review
        <ChevronRightIcon size={15} />
      </button>
    </div>
  );
}

function QueuePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("filter") ?? "all");
  const [queue, setQueue] = useState([]);
  const [counts, setCounts] = useState({ all: 0, flagged: 0, confident: 0, manual: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  // Students whose group is folded shut. Collapsed rather than expanded state,
  // so a student arriving in a later fetch is open by default.
  const [collapsed, setCollapsed] = useState(() => new Set());

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
    if (filter === "confident")
      return queue.filter((row) => row.aiStatus === "graded" && row.flags === 0);
    if (filter === "manual") return queue.filter((row) => row.aiStatus === "unavailable");
    return queue;
  }, [filter, queue]);

  // Grouped after filtering, so a filter empties a group rather than leaving a
  // student's heading behind with nothing under it.
  const groups = useMemo(() => groupByStudent(visible), [visible]);

  const toggleGroup = (studentId) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const acceptConfident = async () => {
    setReleasing(true);
    try {
      await releaseConfident(storedAssessorId());
      navigate("/assessor/credentials");
    } catch {
      setReleasing(false);
    }
  };

  const studentsWaiting = groups.length;

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${counts.all} submission${counts.all === 1 ? "" : "s"} waiting`}
        title="To Grade"
      />

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        <div className="queue-toolbar">
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
              {releasing ? "Releasing…" : "Release all ready"}
            </button>
          ) : null}
        </div>

        {groups.length > 0 ? (
          <p className="assessor-meta queue-summary">
            {countLabel(studentsWaiting, "student")} in this filter
          </p>
        ) : null}

        {groups.map((group) => {
          const isShut = collapsed.has(group.studentId);

          return (
            <section key={group.studentId} className="queue-group">
              <button
                type="button"
                className="queue-group__head"
                onClick={() => toggleGroup(group.studentId)}
                aria-expanded={!isShut}
              >
                <span className="queue-group__chevron" aria-hidden="true">
                  {isShut ? <ChevronRightIcon size={16} /> : <ChevronDownIcon size={16} />}
                </span>

                <Person as="span" name={group.name} sid={group.sid} />

                <span className="queue-group__meta">
                  {[
                    group.finals ? countLabel(group.finals, "final") : null,
                    group.quizzes ? countLabel(group.quizzes, "quiz") : null
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>

                <span className="queue-group__tags">
                  {group.attention > 0 ? (
                    <Chip tone="brand-soft" dot>
                      {group.attention} need{group.attention === 1 ? "s" : ""} your read
                    </Chip>
                  ) : (
                    <Chip tone="info">All ready to release</Chip>
                  )}
                </span>
              </button>

              {isShut ? null : (
                <div className="queue-group__rows">
                  {group.rows.map((row) => (
                    <QueueRow
                      key={row.id}
                      row={row}
                      onReview={(id) => navigate(`/assessor/review/${id}`)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {groups.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            {isLoading ? "Loading submissions…" : "Nothing in this filter."}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default QueuePage;
