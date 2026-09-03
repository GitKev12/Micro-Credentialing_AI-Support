import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchClassRoster, storedAssessorId } from "../../services/assessors";
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
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const assessorId = storedAssessorId();
    if (!assessorId || !classId) {
      setIsLoading(false);
      return undefined;
    }

    fetchClassRoster(assessorId, classId)
      .then((data) => {
        if (!active) return;
        setCourse(data?.course ?? null);
        setStudents(data?.roster ?? []);
        setTotal(data?.totalModules ?? 0);
      })
      .catch(() => {
        if (active) setStudents([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [classId]);

  const roster = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(term) || (student.sid ?? "").includes(term)
    );
  }, [query, students]);

  return (
    <>
      <ScreenHeader
        back={{ label: "Classes", onClick: () => navigate("/assessor/classes") }}
        eyebrow={course ? `${course.code}${course.section ? ` · ${course.section}` : ""}` : ""}
        title={course ? `${course.name} — Students` : "Students"}
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
          <span>Badges</span>
          <span>Status</span>
          <span />
        </div>

        {roster.map((student) => {
          const pct = total > 0 ? Math.round((student.done / total) * 100) : 0;

          return (
            <button
              type="button"
              key={student.id}
              className="data-row data-row--clickable roster-grid"
              onClick={() => navigate(`/assessor/classes/${classId}/students/${student.id}`)}
            >
              <Person name={student.name} sid={student.sid} />

              <ProgressBar label={`${student.done} of ${total} modules`} pct={pct} />

              <CredentialDots earned={student.creds} total={total} />

              {/* Nothing here waits on a grade — a paper is marked as it is
                  handed in. What can still be waiting is a pass whose
                  credential nobody has issued. */}
              <span>
                <Chip tone={student.awaiting ? "brand" : "neutral"}>
                  {student.awaiting ? `${student.awaiting} to approve` : "Up to date"}
                </Chip>
              </span>

              <span style={{ color: "var(--brand)", opacity: 0.55 }}>
                <ChevronRightIcon size={18} />
              </span>
            </button>
          );
        })}

        {!isLoading && roster.length === 0 ? (
          <p className="assessor-meta" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
            {students.length === 0 ? "No students are enrolled yet." : "No students match your search."}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default RosterPage;
