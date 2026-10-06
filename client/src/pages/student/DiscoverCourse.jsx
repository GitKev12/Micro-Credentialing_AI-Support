import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getStoredSession } from "../../auth/services/authService";
import { fetchDiscoverCourse, enrollInClass, cancelEnrollRequest } from "../../services/discover";
import { formatCourseRange, formatCourseLength } from "../../lib/courseDuration";
import CourseCover from "./components/CourseCover";
import { BackIcon } from "./components/icons";

export default function DiscoverCourse() {
  const { courseId } = useParams();
  const studentId = getStoredSession()?.user?.id;
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const confirmButton = useRef(null);
  const actionButtons = useRef({});
  const currentPage = useRef(0);

  useEffect(() => {
    const page = ++currentPage.current;
    setStatus("loading"); setConfirm(null); setError(null); setMessage(""); setBusy(false);
    fetchDiscoverCourse(studentId, courseId).then((data) => {
      if (page === currentPage.current) { setDetail(data); setStatus("ready"); }
    }).catch((err) => {
      if (page === currentPage.current) { setError({ message: err.response?.data?.message || "Couldn't load this course." }); setStatus("error"); }
    });
    return () => { currentPage.current++; };
  }, [studentId, courseId, attempt]);

  useEffect(() => { if (confirm) confirmButton.current?.focus(); }, [confirm]);

  function closeConfirm(id) {
    setConfirm(null);
    requestAnimationFrame(() => actionButtons.current[id]?.focus());
  }

  async function act(section, cancel = false) {
    if (busy) return;
    const page = currentPage.current;
    setBusy(true); setError(null);
    try {
      const data = await (cancel ? cancelEnrollRequest : enrollInClass)(studentId, section.id);
      if (page !== currentPage.current) return;
      setDetail(data); setConfirm(null);
      setMessage(cancel ? "Request canceled." : section.enrollment === "open" ? `Enrolled in ${section.name}.` : "Request sent. Waiting for admin approval.");
      requestAnimationFrame(() => actionButtons.current[section.id]?.focus());
    } catch (err) {
      if (page !== currentPage.current) return;
      // A refused class won't take a second try, so the confirm closes.
      closeConfirm(section.id);
      setError({ id: section.id, message: err.response?.data?.message || "Couldn't save your enrollment. Try again." });
    } finally {
      if (page === currentPage.current) setBusy(false);
    }
  }

  const course = detail?.course;
  return (
    <main className="sd-dcourse">
      <Link className="sd-btn sd-btn--sm" to="/student/discover"><BackIcon />Discover</Link>
      {status === "loading" ? <div className="sd-dcourse__hero sd-skeleton" role="status" aria-label="Loading course" /> : status === "error" ? (
        <div className="sd-discover__error" role="alert">{error?.message} <button className="sd-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div>
      ) : <>
        <div className="sd-dcourse__hero">
          <CourseCover course={course} className="sd-dcourse__cover" />
          <div className="sd-dcourse__body">
            <span className="sd-dcourse__code">{course.code}</span>
            <h1 className="sd-dcourse__title">{course.title}</h1>
            <div className="sd-dcourse__when"><span>{formatCourseRange(course)}</span><span>{formatCourseLength(course)}</span></div>
            {course.description ? <p className="sd-dcourse__desc">{course.description}</p> : null}
          </div>
        </div>
        <dl className="sd-dcourse__facts">
          <div className="sd-dcourse__fact"><dt>Lessons</dt><dd>{course.lessonCount}</dd></div>
          <div className="sd-dcourse__fact"><dt>Badges</dt><dd>{course.badgeCount}</dd></div>
          <div className="sd-dcourse__fact"><dt>Final exam</dt><dd>{course.hasFinalExam ? "Posted" : "Not posted"}</dd></div>
        </dl>
        <h2 className="sd-dcourse__h2">Sections</h2>
        {detail.sections.length === 0 ? <p>No sections are open for enrollment.</p> : <ul className="sd-sections">
          {detail.sections.map((section) => <li key={section.id} className="sd-section" data-state={section.state}>
            <div className="sd-section__text">
              <h3 className="sd-section__name">{section.name}</h3>
              {section.mode === "assessOnly" ? <span className="sd-section__tag">Assessment only</span> : null}
              <div className="sd-section__schedule">{[section.schedule?.days, section.schedule?.time, section.schedule?.room].filter(Boolean).map((part, i) => <span key={i}>{part}</span>)}</div>
              {section.assessor ? <p className="sd-section__assessor">{section.assessor}</p> : null}
            </div>
            <div className="sd-section__action">
              {section.state === "enrolled" ? <>
                <span className="sd-state" data-state="enrolled">Enrolled</span>
                <Link ref={(el) => { actionButtons.current[section.id] = el; }} className="sd-btn" to={`/student/courses/${course.id}/modules`}>Open course</Link>
              </> : section.state === "pending" ? <>
                <span className="sd-state" data-state="pending">Request pending</span>
                <button ref={(el) => { actionButtons.current[section.id] = el; }} className="sd-btn" disabled={busy} onClick={() => act(section, true)}>Cancel request</button>
              </> : !course.enrolled && !course.pending && section.open ? confirm === section.id ? (
                <div className="sd-section__confirm">
                  <p>{section.enrollment === "open" ? `Enroll in ${section.name}? Only an administrator can take you out of a class.` : `Request to enroll in ${section.name}? An administrator will review your request.`}</p>
                  <button ref={confirmButton} className="sd-enroll" disabled={busy} onClick={() => act(section)}>{busy ? "Saving…" : "Confirm"}</button>
                  <button className="sd-btn" disabled={busy} onClick={() => closeConfirm(section.id)}>Cancel</button>
                </div>
              ) : <button ref={(el) => { actionButtons.current[section.id] = el; }} className="sd-enroll" disabled={busy} onClick={() => { setConfirm(section.id); setError(null); }}>{section.enrollment === "open" ? "Enroll" : "Request to enroll"}</button> : null}
            </div>
            {error?.id === section.id ? <p className="sd-section__error" role="alert">{error.message}</p> : null}
          </li>)}
        </ul>}
        <p className="sd-dcourse__status" role="status">{message}</p>
      </>}
    </main>
  );
}
