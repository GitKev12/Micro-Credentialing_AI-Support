import { useEffect, useMemo, useState } from "react";
import { fetchCourse, fetchCourses } from "../../services/admin";
import { ChevronRightIcon } from "./components/icons";
import { AdminButton, BackLink, PageHeader, SearchField } from "./components/ui";

function CourseManagement() {
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");

  useEffect(() => {
    let active = true;

    fetchCourses()
      .then((list) => {
        if (!active) return;
        setCourses(list);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const openCourse = (courseId) => {
    setDetailStatus("loading");
    setSelected({ id: courseId });
    fetchCourse(courseId)
      .then((course) => {
        setSelected(course);
        setDetailStatus("ready");
      })
      .catch(() => setDetailStatus("error"));
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) =>
      `${course.title} ${course.code}`.toLowerCase().includes(term)
    );
  }, [courses, query]);

  if (selected) {
    const modules = selected.modules ?? [];

    return (
      <div className="admin-main__inner">
        <BackLink onClick={() => setSelected(null)}>Courses Management</BackLink>

        <PageHeader
          title={selected.title ?? "Course"}
          subtitle={
            detailStatus === "ready"
              ? `${selected.code} · ${modules.length} modules`
              : "Loading course…"
          }
        />

        <div className="admin-card">
          <h2 className="admin-card__title">Learning Modules</h2>

          {detailStatus === "loading" ? (
            <p className="admin-empty-note">Loading modules…</p>
          ) : detailStatus === "error" ? (
            <p className="admin-empty-note">Couldn&apos;t load this course.</p>
          ) : (
            <div className="admin-module-list">
              {modules.map((module) => (
                <div className="admin-module-row" key={module.id}>
                  <span className="admin-module-row__label">{module.title}</span>
                  <span className="admin-assign-row__meta">{module.fileName}</span>
                </div>
              ))}
              {modules.length === 0 ? (
                <p className="admin-empty-note">
                  No learning modules uploaded for this course yet.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Courses Management"
        subtitle="Select a course to review its learning modules"
        action={<AdminButton>+ New Course</AdminButton>}
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search courses…"
        label="Search courses"
      />

      {status === "loading" ? (
        <p className="admin-empty-note">Loading courses…</p>
      ) : status === "error" ? (
        <p className="admin-empty-note">
          Couldn&apos;t reach the API. Check that the server is running.
        </p>
      ) : (
        <>
          <div className="admin-course-grid">
            {visible.map((course) => (
              <button
                type="button"
                key={course.id}
                className="admin-course-card"
                onClick={() => openCourse(course.id)}
              >
                <div className="admin-course-card__head">
                  <div className="admin-course-card__code">{course.code}</div>
                  <div className="admin-course-card__title">{course.title}</div>
                </div>
                <div className="admin-course-card__body">
                  <p className="admin-course-card__desc">{course.description}</p>
                  <div className="admin-course-card__meta">
                    <span>
                      <strong className="admin-strong-brand">{course.moduleCount}</strong> modules
                    </span>
                    <span>
                      <strong className="admin-strong-brand">{course.studentCount}</strong> students
                    </span>
                    <span className="admin-course-card__manage">
                      Manage
                      <ChevronRightIcon size={14} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="admin-empty-note">No courses match your search.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default CourseManagement;
