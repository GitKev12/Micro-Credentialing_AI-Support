import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getStoredSession } from "../../auth/services/authService";
import { fetchDiscoverCourse, enrollInCourse, cancelEnrollRequest } from "../../services/discover";
import { formatCourseRange } from "../../lib/courseDuration";
import CourseCover from "./components/CourseCover";
import { BackIcon } from "./components/icons";

/**
 * One course on Discover: what it is, what is in it, and the way in.
 *
 * Laid out as a catalogue entry rather than a list of classes — the course is
 * the thing being offered, so it gets the page, and the way in is one card
 * inside it. Sections are not here at all: a section is how the school sorts
 * its students, so the candidate chooses the pathway and the server puts them
 * in a section running it.
 */

const PATHWAY_DETAIL = {
  taught: "Read the lessons, pass each quiz for its badge, then take the final exam.",
  assessOnly: "Take the final exam on its own. No lessons, no quizzes, no badges."
};

export default function DiscoverCourse() {
  const { courseId } = useParams();
  const studentId = getStoredSession()?.user?.id;
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const confirmButton = useRef(null);
  const enrollButton = useRef(null);
  const currentPage = useRef(0);

  useEffect(() => {
    const page = ++currentPage.current;
    setStatus("loading"); setConfirming(false); setError(""); setMessage(""); setBusy(false); setMode(null);
    fetchDiscoverCourse(studentId, courseId).then((data) => {
      if (page !== currentPage.current) return;
      setDetail(data);
      // One pathway is not a choice, so it is chosen already.
      setMode(data.pathways.length === 1 ? data.pathways[0].mode : null);
      setStatus("ready");
    }).catch((err) => {
      if (page !== currentPage.current) return;
      setError(err.response?.data?.message || "Couldn't load this course.");
      setStatus("error");
    });
    return () => { currentPage.current++; };
  }, [studentId, courseId, attempt]);

  useEffect(() => { if (confirming) confirmButton.current?.focus(); }, [confirming]);

  function stopConfirming() {
    setConfirming(false);
    requestAnimationFrame(() => enrollButton.current?.focus());
  }

  async function act(cancel = false) {
    if (busy) return;
    const page = currentPage.current;
    setBusy(true); setError("");
    try {
      const data = cancel
        ? await cancelEnrollRequest(studentId, courseId)
        : await enrollInCourse(studentId, courseId, mode);
      if (page !== currentPage.current) return;
      setDetail(data); setConfirming(false);
      setMessage(cancel ? "Request canceled."
        : chosen?.enrollment === "open" ? "You're enrolled."
        : "Request sent. An administrator will review it.");
    } catch (err) {
      if (page !== currentPage.current) return;
      setConfirming(false);
      setError(err.response?.data?.message || "Couldn't save your enrollment. Try again.");
    } finally {
      if (page === currentPage.current) setBusy(false);
    }
  }

  const course = detail?.course;
  const pathways = detail?.pathways ?? [];
  const curriculum = detail?.curriculum ?? [];
  const chosen = pathways.find((pathway) => pathway.mode === mode) ?? null;

  if (status === "loading") {
    return (
      <main className="sd-dcourse">
        <div className="sd-dcourse__hero sd-skeleton" role="status" aria-label="Loading course" />
      </main>
    );
  }
  if (status === "error") {
    return (
      <main className="sd-dcourse">
        <div className="sd-discover__error" role="alert">
          {error} <button className="sd-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      </main>
    );
  }

  return (
    <main className="sd-dcourse">
      <nav className="sd-crumbs" aria-label="Breadcrumb">
        <Link className="sd-crumbs__link" to="/student/discover"><BackIcon />Discover</Link>
        <span className="sd-crumbs__here">{course.title}</span>
      </nav>

      <div className="sd-dcourse__grid">
        <div className="sd-dcourse__main">
          <span className="sd-dcourse__code">{course.code}</span>
          <h1 className="sd-dcourse__title">{course.title}</h1>
          {course.description ? <p className="sd-dcourse__desc">{course.description}</p> : null}

          <section className="sd-join" aria-label="Enrollment">
            {course.enrolled ? (
              <div className="sd-join__row">
                <span className="sd-state" data-state="enrolled">Enrolled</span>
                <Link className="sd-enroll" to={`/student/courses/${course.id}/modules`}>Open course</Link>
              </div>
            ) : course.pending ? (
              <div className="sd-join__row">
                <span className="sd-state" data-state="pending">Request pending</span>
                <button className="sd-btn" disabled={busy} onClick={() => act(true)}>Cancel request</button>
              </div>
            ) : pathways.length === 0 ? (
              <p className="sd-join__shut">This course isn't open for enrollment right now.</p>
            ) : (
              <>
                {/* With two pathways on offer the choice is the student's, and
                    it is a real one: assess-only never opens the lessons. */}
                {pathways.length > 1 ? (
                  <div className="sd-join__choice" role="radiogroup" aria-label="How do you want to take this course?">
                    {pathways.map((pathway) => (
                      <label
                        key={pathway.mode}
                        className={`sd-join__option${mode === pathway.mode ? " is-chosen" : ""}`}
                      >
                        <input
                          type="radio"
                          name="pathway"
                          className="sd-join__input"
                          checked={mode === pathway.mode}
                          disabled={busy}
                          onChange={() => { setMode(pathway.mode); setConfirming(false); }}
                        />
                        <span className="sd-join__mark" aria-hidden="true" />
                        <span className="sd-join__body">
                          <span className="sd-join__name">{pathway.label}</span>
                          <span className="sd-join__detail">{PATHWAY_DETAIL[pathway.mode]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {confirming ? (
                  <div className="sd-join__confirm">
                    <p className="sd-join__ask">
                      {chosen.enrollment === "open"
                        ? "Enroll now? Only an administrator can take you out afterwards."
                        : "Send your request? An administrator will review it."}
                    </p>
                    <div className="sd-join__row">
                      <button ref={confirmButton} className="sd-enroll" disabled={busy} onClick={() => act()}>
                        {busy ? "Saving…" : "Confirm"}
                      </button>
                      <button className="sd-btn" disabled={busy} onClick={stopConfirming}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="sd-join__row">
                    <button
                      ref={enrollButton}
                      className="sd-enroll"
                      disabled={busy || !chosen}
                      onClick={() => { setConfirming(true); setError(""); }}
                    >
                      {chosen?.enrollment === "approval" ? "Request to enroll" : "Enroll"}
                    </button>
                    {course.learnerCount > 0 ? (
                      <span className="sd-join__count">{course.learnerCount} already enrolled</span>
                    ) : null}
                  </div>
                )}
              </>
            )}
            {error ? <p className="sd-join__error" role="alert">{error}</p> : null}
          </section>

          {curriculum.length > 0 ? (
            <section className="sd-syllabus" aria-labelledby="sd-syllabus-title">
              <h2 className="sd-dcourse__h2" id="sd-syllabus-title">What you will learn</h2>
              <ol className="sd-syllabus__list">
                {curriculum.map((lesson, index) => (
                  <li className="sd-syllabus__item" key={lesson.id}>
                    <span className="sd-syllabus__n">{index + 1}</span>
                    <span className="sd-syllabus__title">{lesson.title}</span>
                    {lesson.badge ? <span className="sd-syllabus__badge">{lesson.badge}</span> : null}
                  </li>
                ))}
                {course.hasFinalExam ? (
                  <li className="sd-syllabus__item sd-syllabus__item--final">
                    <span className="sd-syllabus__n" aria-hidden="true">★</span>
                    <span className="sd-syllabus__title">Final exam</span>
                  </li>
                ) : null}
              </ol>
            </section>
          ) : null}
        </div>

        <aside className="sd-dcourse__side">
          <CourseCover course={course} className="sd-dcourse__cover" />
          <dl className="sd-dcourse__facts">
            <div className="sd-dcourse__fact"><dt>Lessons</dt><dd>{course.lessonCount}</dd></div>
            <div className="sd-dcourse__fact"><dt>Badges</dt><dd>{course.badgeCount}</dd></div>
            {/* Only when an admin has set it. */}
            {course.courseHours ? <div className="sd-dcourse__fact"><dt>Hours</dt><dd>{course.courseHours}</dd></div> : null}
            <div className="sd-dcourse__fact"><dt>Runs</dt><dd>{formatCourseRange(course)}</dd></div>
          </dl>
        </aside>
      </div>

      <p className="sd-dcourse__status" role="status">{message}</p>
    </main>
  );
}
