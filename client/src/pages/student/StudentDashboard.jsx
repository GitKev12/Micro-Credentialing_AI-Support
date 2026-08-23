import { useEffect, useMemo, useState } from "react";
import StudentSidebar from "./components/StudentSidebar";
import CoursePerformance from "./components/CoursePerformance";
import CourseCard from "./components/CourseCard";
import SkillGapAnalysis from "./components/SkillGapAnalysis";
import RawComputation from "./components/RawComputation";
import { BackIcon, BookIcon, SkillsIcon, TargetIcon } from "./components/icons";
import { BandChip, EmptyState, Meter, StatTile, TargetLegend } from "./components/ui";
import {
  TARGET,
  averageScore,
  bandFor,
  collectSkills,
  gapToTarget,
  toScore
} from "./performance";
import { getStoredSession } from "../../auth/services/authService";
import { fetchStudentSkillGap } from "../../services/skillGap";
import noCoursesImage from "../../assets/no-courses-student.png";

const FOCUS_LIMIT = 5;

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(displayName) {
  if (!displayName) return "there";
  return displayName.trim().split(/\s+/)[0];
}

function StudentDashboard() {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const student = getStoredSession()?.user;

  // Per-course performance + skills, from the CoursePerformance collection.
  useEffect(() => {
    let active = true;
    const studentId = student?.id;

    fetchStudentSkillGap(studentId)
      .then((list) => {
        if (active) setCourses(list);
      })
      .catch(() => {
        if (active) setCourses([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
    // The session id is read once on mount; it cannot change without a re-login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Derived analytics ───────────────────────────────── */

  const overall = useMemo(
    () => averageScore(courses.map((course) => course.performance)),
    [courses]
  );
  const overallBand = bandFor(overall);

  const allSkills = useMemo(() => collectSkills(courses), [courses]);
  const gaps = useMemo(() => allSkills.filter((skill) => gapToTarget(skill.score) > 0), [allSkills]);
  const completedCount = courses.filter((course) => course.status === "completed").length;

  const railSummary = courses.length
    ? [
        { label: "Overall", value: `${overall}%` },
        { label: "Courses", value: courses.length },
        { label: "Topics to close", value: gaps.length }
      ]
    : [];

  /* ── Detail view ─────────────────────────────────────── */

  if (selected) {
    return (
      <div className="sd-body">
        <StudentSidebar summary={railSummary} />

        <main className="sd-main">
          <div className="sd-breadcrumb">
            <button type="button" className="sd-btn sd-btn--sm" onClick={() => setSelected(null)}>
              <BackIcon size={15} />
              Back to dashboard
            </button>
          </div>

          <CoursePerformance
            title={selected.title}
            performance={selected.performance}
            skillCount={(selected.skills ?? []).length}
          />
          <SkillGapAnalysis skills={selected.skills} />
          <RawComputation course={selected} />
        </main>
      </div>
    );
  }

  /* ── Overview ────────────────────────────────────────── */

  return (
    <div className="sd-body">
      <StudentSidebar summary={railSummary} />

      <main className="sd-main">
        {isLoading ? (
          <>
            <div className="sd-skeleton sd-skeleton--hero" aria-hidden="true" />
            <ul className="sd-kpis" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="sd-skeleton sd-skeleton--tile" />
              ))}
            </ul>
            <p className="sd-sr-only" role="status">
              Loading your analytics…
            </p>
          </>
        ) : courses.length === 0 ? (
          <section className="sd-card">
            <EmptyState image={noCoursesImage} title="No course analytics yet">
              Your skill gap analysis appears here once you have sat a course&apos;s final
              exam. Nothing to do in the meantime — keep working through your modules.
            </EmptyState>
          </section>
        ) : (
          <>
            {/*/!* Hero — the one figure this view leads with. *!/*/}
            {/*<section className="sd-hero" aria-labelledby="sd-overall-label">*/}
            {/*  <div>*/}
            {/*    <p className="sd-hero__greeting">*/}
            {/*      {greeting()}, <span>{firstName(student?.displayName)}</span>*/}
            {/*    </p>*/}
            {/*    <p className="sd-sub">*/}
            {/*      {gaps.length === 0*/}
            {/*        ? `Every topic you have been assessed on sits at or above the ${TARGET}% passing mark.`*/}
            {/*        : `${gaps.length} ${*/}
            {/*            gaps.length === 1 ? "topic sits" : "topics sit"*/}
            {/*          } below the ${TARGET}% passing mark across ${courses.length} ${*/}
            {/*            courses.length === 1 ? "course" : "courses"*/}
            {/*          }. The list below is ordered by where you would gain the most.`}*/}
            {/*    </p>*/}
            {/*  </div>*/}

            {/*  <div className="sd-hero__figure">*/}
            {/*    <p className="sd-hero__label" id="sd-overall-label">*/}
            {/*      Overall performance*/}
            {/*    </p>*/}
            {/*    <p className="sd-hero__value">*/}
            {/*      {overall}*/}
            {/*      <small>%</small>*/}
            {/*    </p>*/}
            {/*    <div className="sd-hero__meter">*/}
            {/*      <Meter*/}
            {/*        value={overall}*/}
            {/*        band={overallBand}*/}
            {/*        label={`Overall performance across all courses: ${overall} percent, ${overallBand.label}`}*/}
            {/*      />*/}
            {/*    </div>*/}
            {/*    <div className="sd-hero__foot">*/}
            {/*      <TargetLegend />*/}
            {/*      <BandChip band={overallBand} />*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</section>*/}

            {/*/!* KPI row — headline counts, no chart needed. *!/*/}
            {/*<ul className="sd-kpis">*/}
            {/*  <StatTile*/}
            {/*    icon={<BookIcon />}*/}
            {/*    label="Courses tracked"*/}
            {/*    value={courses.length}*/}
            {/*    note={*/}
            {/*      completedCount*/}
            {/*        ? `${completedCount} completed · ${courses.length - completedCount} in progress`*/}
            {/*        : "All in progress"*/}
            {/*    }*/}
            {/*  />*/}
            {/*  <StatTile*/}
            {/*    icon={<SkillsIcon />}*/}
            {/*    label="Topics assessed"*/}
            {/*    value={allSkills.length}*/}
            {/*    note={*/}
            {/*      allSkills.length*/}
            {/*        ? `Averaging ${averageScore(allSkills.map((skill) => skill.score))}% across every topic`*/}
            {/*        : "No topic scores yet"*/}
            {/*    }*/}
            {/*  />*/}
            {/*  <StatTile*/}
            {/*    icon={<TargetIcon />}*/}
            {/*    label="Topics below passing"*/}
            {/*    value={gaps.length}*/}
            {/*    note={*/}
            {/*      gaps.length*/}
            {/*        ? `Closing them needs ${gaps.reduce(*/}
            {/*            (sum, skill) => sum + gapToTarget(skill.score),*/}
            {/*            0*/}
            {/*          )} points in total`*/}
            {/*        : `Nothing under the ${TARGET}% mark`*/}
            {/*    }*/}
            {/*  />*/}
            {/*</ul>*/}

            {/*/!* Cross-course focus list — the weakest topics, wherever they live. *!/*/}
            {/*{allSkills.length ? (*/}
            {/*  <section className="sd-card" aria-labelledby="sd-focus-title">*/}
            {/*    <header className="sd-section-head">*/}
            {/*      <div className="sd-section-head__text">*/}
            {/*        <p className="sd-eyebrow">Where to focus next</p>*/}
            {/*        <h2 className="sd-h3" id="sd-focus-title">*/}
            {/*          Your weakest topics*/}
            {/*        </h2>*/}
            {/*        <p className="sd-sub">*/}
            {/*          Ordered lowest first across every course you are enrolled in.*/}
            {/*        </p>*/}
            {/*      </div>*/}
            {/*      <TargetLegend />*/}
            {/*    </header>*/}

            {/*    <ul className="sd-focus__list">*/}
            {/*      {allSkills.slice(0, FOCUS_LIMIT).map((skill) => {*/}
            {/*        const band = bandFor(skill.score);*/}
            {/*        const course = courses.find((entry) => entry.id === skill.courseId);*/}

            {/*        return (*/}
            {/*          <li className="sd-focus__row" key={skill.key} data-band={band.id}>*/}
            {/*            <div>*/}
            {/*              <p className="sd-focus__topic">{skill.topic}</p>*/}
            {/*              <p className="sd-focus__course">{skill.courseTitle}</p>*/}
            {/*            </div>*/}

            {/*            <div className="sd-focus__meter">*/}
            {/*              <Meter*/}
            {/*                value={skill.score}*/}
            {/*                band={band}*/}
            {/*                small*/}
            {/*                label={`${skill.topic} in ${skill.courseTitle}: ${skill.score} percent, ${band.label}`}*/}
            {/*              />*/}
            {/*            </div>*/}

            {/*            <span className="sd-focus__value">*/}
            {/*              {toScore(skill.score)}*/}
            {/*              <small>%</small>*/}
            {/*            </span>*/}

            {/*            /!* The course grid used to be the way into the full*/}
            {/*                analysis; the row that names the course now is. *!/*/}
            {/*            {course ? (*/}
            {/*              <button*/}
            {/*                type="button"*/}
            {/*                className="sd-focus__open"*/}
            {/*                onClick={() => setSelected(course)}*/}
            {/*                aria-label={`Open the full skill gap analysis for ${skill.courseTitle}`}*/}
            {/*              />*/}
            {/*            ) : null}*/}
            {/*          </li>*/}
            {/*        );*/}
            {/*      })}*/}
            {/*    </ul>*/}
            {/*  </section>*/}
            {/*) : null}*/}

            {/* Every course, not just the five weakest topics' courses.
                The focus list above is capped, so without this a course whose
                topics all sit outside the top five has no way in at all — and
                the course a student most wants to read about after passing is
                exactly the one that stays off that list. */}
            <section className="sd-card" aria-labelledby="sd-courses-title">
              <header className="sd-section-head">
                <div className="sd-section-head__text">
                  <p className="sd-eyebrow">Full breakdown</p>
                  <h2 className="sd-h3" id="sd-courses-title">
                    Your courses
                  </h2>
                </div>
              </header>

              <ul className="sd-cc-grid">
                {courses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    onOpen={() => setSelected(course)}
                  />
                ))}
              </ul>
            </section>
          </>
        )}

      </main>
    </div>
  );
}

export default StudentDashboard;
