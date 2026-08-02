import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import data from "./assessorSampleData.json";
import { ChevronRightIcon } from "./components/icons";
import {
  Chip,
  CredentialDots,
  Person,
  ProgressBar,
  ScreenHeader,
  SearchField
} from "./components/ui";

function RosterPage() {
  const navigate = useNavigate();
  const { classId } = useParams();
  const [query, setQuery] = useState("");

  const course = data.classes.find((c) => c.id === classId) ?? data.classes[0];
  const total = data.totalModules;

  const roster = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.roster;
    return data.roster.filter(
      (student) =>
        student.name.toLowerCase().includes(term) || student.sid.includes(term)
    );
  }, [query]);

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={`${course.code} · ${course.section}`}
        title={`${course.name} — Students`}
      >
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search student or ID number"
          label="Search students"
        />
      </ScreenHeader>

      <div className="assessor-body assessor-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
        <div className="row-head roster-grid">
          <span>Student</span>
          <span>Module progress</span>
          <span>Credentials</span>
          <span>Status</span>
          <span />
        </div>

        {roster.map((student) => {
          const pct = Math.round((student.done / total) * 100);

          return (
            <button
              type="button"
              key={student.id}
              className="data-row data-row--clickable roster-grid"
              onClick={() => navigate(`/assessor/classes/${course.id}/students/${student.id}`)}
            >
              <Person name={student.name} sid={student.sid} />

              <ProgressBar label={`${student.done} of ${total} modules`} pct={pct} />

              <CredentialDots earned={student.creds} total={total} />

              <span>
                <Chip tone={student.pending ? "brand" : "neutral"}>
                  {student.pending ? `${student.pending} to grade` : "Up to date"}
                </Chip>
              </span>

              <span style={{ color: "var(--brand)", opacity: 0.55 }}>
                <ChevronRightIcon size={18} />
              </span>
            </button>
          );
        })}

        {roster.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            No students match your search.
          </p>
        ) : null}
      </div>
    </>
  );
}

export default RosterPage;
