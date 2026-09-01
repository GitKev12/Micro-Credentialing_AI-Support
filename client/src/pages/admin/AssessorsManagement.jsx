import { useEffect, useMemo, useState } from "react";
import {
  createAssessor,
  deleteAssessor,
  fetchAssessor,
  fetchAssessorImpact,
  fetchAssessors,
  fetchCourses,
  setAssessorSuspended,
  updateAssessor
} from "../../services/admin";
import { AssessorsIcon, ChevronRightIcon } from "./components/icons";
import {
  AdminButton,
  AdminSelect,
  Avatar,
  ConfirmDeleteModal,
  PageHeader,
  SearchField
} from "./components/ui";
import { SkeletonTable } from "../../components/Skeleton";
import AssessorDetail from "./components/assessors/AssessorDetail";
import AssessorForm from "./components/assessors/AssessorForm";
import {
  activityKindLabel,
  assessorKeeps,
  assessorLosses,
  EMPTY_WORKLOAD
} from "./components/assessors/assessorText";
import { formatDate } from "./lib/format";
import { useLatestRequest } from "../../lib/useLatestRequest";
import { useNotice } from "../../lib/useNotice";

// The two categories that are not a course: everyone, and everyone with no
// course at all. The students list is narrowed by the same two.
const CATEGORY_ALL = "all";
const CATEGORY_NONE = "none";

const EMPTY_COVERAGE = { unassigned: [], shared: [], unposted: [] };

function AssessorsManagement() {
  const [assessors, setAssessors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [coverage, setCoverage] = useState(EMPTY_COVERAGE);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(CATEGORY_ALL);

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  // The result of the last write, which is now only an edit to the assessor's
  // own details. A write that failed used to leave no trace on screen at all.
  const [notice, setNotice] = useNotice();

  // The assessor whose details are being corrected, if any.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  // The assessor awaiting a "yes, delete", with the cost filled in once read.
  const [deleting, setDeleting] = useState(null);
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchAssessors(), fetchCourses()])
      .then(([assessorData, courseList]) => {
        if (!active) return;
        setAssessors(assessorData.assessors);
        setCoverage(assessorData.coverage);
        setCourses(courseList);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const detailRequest = useLatestRequest();
  const impactRequest = useLatestRequest();

  const openAssessor = (assessorId) => {
    // Claimed before the fetch, so a slower reply for a record the
    // admin has already clicked past is dropped rather than shown.
    const token = detailRequest.next();
    setDetailStatus("loading");
    setSelected({ id: assessorId });
    setNotice(null);
    fetchAssessor(assessorId)
      .then((assessor) => {
        if (!detailRequest.isCurrent(token)) return;
        setSelected(assessor);
        setDetailStatus("ready");
      })
      .catch(() => {
        if (detailRequest.isCurrent(token)) setDetailStatus("error");
      });
  };

  const saveAssessor = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      if (form === "new") {
        const created = await createAssessor(values);
        // Re-read rather than append: the list is sorted by name on the server,
        // so an appended row sits at the bottom until the next load and then
        // jumps. The shared-course note is recounted with it.
        const fresh = await fetchAssessors();
        setAssessors(fresh.assessors);
        setCoverage(fresh.coverage);
        setNotice({ tone: "ok", text: `${created.name} was added.` });
      } else {
        const saved = await updateAssessor(form.id, values);
        setAssessors((list) => list.map((a) => (a.id === saved.id ? { ...a, ...saved } : a)));
        setSelected((assessor) => (assessor ? { ...assessor, ...saved } : assessor));
        setNotice({ tone: "ok", text: `${saved.name}'s details were updated.` });
      }
      setForm(null);
    } catch (error) {
      setFormError(error?.response?.data?.message || "Couldn't save this assessor. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Suspend this assessor, or let them back in.
   *
   * Written straight from the row, as on the student list, and just as
   * reversible — nothing is destroyed. A suspended assessor keeps their
   * account and their assigned courses; they simply cannot sign in, and the
   * papers waiting on them stay waiting. The row moves first and goes back if
   * the write fails.
   */
  const askToDelete = (assessor) => {
    // The costs are read for one record; a reply that arrives after the
    // admin has cancelled and opened another must not fill in that one.
    const token = impactRequest.next();
    setDeleting(assessor);
    setImpact(null);
    fetchAssessorImpact(assessor.id)
      .then((data) => {
        if (impactRequest.isCurrent(token)) setImpact(data);
      })
      .catch(() => {
        if (impactRequest.isCurrent(token)) setImpact({ unknown: true });
      });
  };

  const removeAssessor = async () => {
    setBusy(true);
    try {
      const { assessor } = await deleteAssessor(deleting.id);
      // Re-read rather than filter: losing an assessor changes who else is on
      // their courses, and the shared-course note above the table is counted on
      // the server. Filtering the row out locally would drop the assessor from
      // view while that note went on naming a course they no longer share.
      const fresh = await fetchAssessors();
      setAssessors(fresh.assessors);
      setCoverage(fresh.coverage);
      setDeleting(null);
      setImpact(null);
      // The detail screen is looking at a record that no longer exists.
      if (selected?.id === deleting.id) setSelected(null);
      setNotice({ tone: "ok", text: `${assessor.name} was deleted.` });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Couldn't delete this assessor."
      });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleSuspended = async (assessor) => {
    const next = !assessor.suspended;
    const patch = (list) =>
      list.map((row) => (row.id === assessor.id ? { ...row, suspended: next } : row));

    setAssessors(patch);
    setBusy(true);
    try {
      await setAssessorSuspended(assessor.id, next);
      setSelected((current) =>
        current && current.id === assessor.id ? { ...current, suspended: next } : current
      );
      setNotice({
        tone: "ok",
        text: `${assessor.name} is now ${next ? "suspended" : "active"}.`
      });
    } catch (error) {
      setAssessors((list) =>
        list.map((row) =>
          row.id === assessor.id ? { ...row, suspended: assessor.suspended } : row
        )
      );
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Couldn't change this assessor's status."
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * The options behind the category dropdown, with how many assessors each
   * holds. One control whatever the catalog does — six courses and sixty read
   * the same way, which a row of chips cannot claim.
   */
  const categories = useMemo(() => {
    const perCourse = new Map(courses.map((course) => [course.id, 0]));
    let unassigned = 0;

    for (const assessor of assessors) {
      const assigned = assessor.assigned ?? [];
      if (assigned.length === 0) {
        unassigned += 1;
        continue;
      }
      for (const course of assigned) {
        perCourse.set(course.id, (perCourse.get(course.id) ?? 0) + 1);
      }
    }

    return [
      { id: CATEGORY_ALL, label: "All assessors", meta: `${assessors.length}` },
      ...courses.map((course) => ({
        id: course.id,
        label: course.title || course.code,
        meta: `${course.code} · ${perCourse.get(course.id) ?? 0}`
      })),
      { id: CATEGORY_NONE, label: "Not assigned to any course", meta: `${unassigned}` }
    ];
  }, [assessors, courses]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return assessors.filter((assessor) => {
      const assigned = assessor.assigned ?? [];

      // The category narrows first, so the search only ever runs over the
      // rows already on screen.
      const inCategory =
        category === CATEGORY_ALL
          ? true
          : category === CATEGORY_NONE
            ? assigned.length === 0
            : assigned.some((course) => course.id === category);
      if (!inCategory) return false;
      if (!term) return true;

      return `${assessor.name} ${assessor.assessorNumber ?? ""} ${assessor.email ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [assessors, query, category]);

  /**
   * Rendered by both branches below.
   *
   * The detail screen returns before the list's JSX is reached, so a confirm
   * that lived only down there opened for a row and did nothing at all for the
   * Delete button on the detail — which is the one place the account is fully
   * in view when you decide.
   */
  const deleteConfirm = deleting ? (
    <ConfirmDeleteModal
      title="Delete this assessor?"
      subject={`${deleting.name}${deleting.assessorNumber ? ` · ${deleting.assessorNumber}` : ""}`}
      losses={assessorLosses(impact)}
      keeps={assessorKeeps(impact)}
      busy={busy}
      confirmLabel="Delete assessor"
      onCancel={() => {
        setDeleting(null);
        setImpact(null);
      }}
      onConfirm={removeAssessor}
    />
  ) : null;

  if (selected) {
    return (
      <>
        <AssessorDetail
        assessor={selected}
        detailStatus={detailStatus}
        busy={busy}
        notice={notice}
        form={form}
        formError={formError}
        onBack={() => setSelected(null)}
        onEdit={() => {
          setFormError(null);
          setForm(selected);
        }}
        onDelete={() => askToDelete(selected)}
        onCancelForm={() => setForm(null)}
        onSave={saveAssessor}
      />
        {deleteConfirm}
      </>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Assessors Management"
        icon={AssessorsIcon}
      />

      {/* Category first, then type. One dropdown holds any number of courses
          without growing sideways, which a row of chips does not. */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__filter">
          <AdminSelect
            value={category}
            onChange={setCategory}
            label="Filter assessors by category"
            options={categories.map((entry) => ({
              value: entry.id,
              label: entry.label,
              meta: entry.meta
            }))}
          />
        </div>

        <div className="admin-toolbar__search">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search assessors…"
            label="Search assessors"
            hint={`${visible.length} of ${assessors.length}`}
            notice={notice}
          />
        </div>

        <AdminButton
          variant="admin-toolbar__action"
          onClick={() => {
            setFormError(null);
            setForm("new");
          }}
          disabled={status !== "ready"}
        >
          New assessor
        </AdminButton>
      </div>

      {/* Sits under the toolbar rather than riding the search row: a shared
          course is a fact about the list, not a problem to act on. */}
      {coverage.shared.length > 0 ? (
        <p className="admin-notice admin-notice--note" role="status">
          Shared by more than one assessor:{" "}
          {coverage.shared
            .map((course) => `${course.code || course.title} (${course.assessors})`)
            .join(", ")}
          . Each of them sees the same submissions.
        </p>
      ) : null}

      {status === "loading" ? (
        <SkeletonTable rows={6} cols={8} label="Loading assessors…" />
      ) : status === "error" ? (
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Assessor</th>
                <th className="is-center">Courses</th>
                <th className="is-center">Students</th>
                <th className="is-center">To post</th>
                <th className="is-center">To issue</th>
                <th>Last active</th>
                <th className="is-center">Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((assessor) => {
                const workload = assessor.workload ?? EMPTY_WORKLOAD;
                const active = formatDate(assessor.lastActive?.at);
                const activeKind = activityKindLabel(assessor.lastActive?.kind);

                return (
                  <tr
                    key={assessor.id}
                    className={assessor.suspended ? "is-inactive" : ""}
                    onClick={() => openAssessor(assessor.id)}
                  >
                    <td>
                      <div className="admin-person">
                        <Avatar name={assessor.name} />
                        <div>
                          {/* The name is the control. The row click stays as a
                              mouse convenience, but it is a <tr> — nothing
                              focuses it, so the only keyboard path was the
                              chevron at the far end of the row. */}
                          <button
                            type="button"
                            className="admin-person__name admin-person__link"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssessor(assessor.id);
                            }}
                          >
                            {assessor.name}
                          </button>
                          <div className="admin-person__id">
                            {assessor.assessorNumber ?? assessor.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="is-center">
                      {assessor.assigned.length > 0 ? (
                        <span className="admin-count">{assessor.assigned.length}</span>
                      ) : (
                        <span className="admin-count admin-count--none">None</span>
                      )}
                    </td>
                    <td className="is-center">
                      <strong className="admin-strong-brand">{assessor.students}</strong>
                    </td>
                    {/* Papers owed. This is the assessor's own rail badge, and
                        the first thing an admin needs off this row: until it
                        reaches zero their classes have nothing to take, and
                        every column after it will read clear for that reason
                        rather than because the work is done. */}
                    <td className="is-center">
                      {workload.papersExpected === 0 ? (
                        <span className="admin-count admin-count--none">None</span>
                      ) : workload.toPost > 0 ? (
                        <>
                          <span className="admin-count admin-count--warn">{workload.toPost}</span>
                          <span className="admin-cell__sub">of {workload.papersExpected}</span>
                        </>
                      ) : (
                        <span className="admin-cell__quiet">All posted</span>
                      )}
                    </td>
                    {/* A released pass still leaves the credential itself to
                        issue, and that is the last thing a student waits on. */}
                    <td className="is-center">
                      {workload.credentialsPending > 0 ? (
                        <span className="admin-count admin-count--warn">
                          {workload.credentialsPending}
                        </span>
                      ) : (
                        <span className="admin-cell__quiet">Clear</span>
                      )}
                    </td>
                    <td>
                      {active ? (
                        <>
                          <span className="admin-cell__quiet">{active}</span>
                          {activeKind ? (
                            <span className="admin-cell__sub">{activeKind}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="admin-count admin-count--none">Never</span>
                      )}
                    </td>
                    <td className="is-center">
                      <button
                        type="button"
                        className={`admin-switch${assessor.suspended ? "" : " is-on"}`}
                        role="switch"
                        aria-checked={!assessor.suspended}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSuspended(assessor);
                        }}
                        title={
                          assessor.suspended
                            ? `Activate ${assessor.name}`
                            : `Suspend ${assessor.name}`
                        }
                      >
                        <span className="admin-switch__track">
                          <span className="admin-switch__thumb" />
                        </span>
                        <span className="admin-switch__label">
                          {assessor.suspended ? "Suspended" : "Active"}
                        </span>
                      </button>
                    </td>
                    <td className="admin-table__chevron" aria-hidden="true">
                      <span className="admin-table__cue">
                        <ChevronRightIcon />
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  {/* A filtered-to-nothing table says something different from
                      a search that missed, and an admin needs to know which
                      of the two they are looking at. */}
                  <td colSpan={8}>
                    {query.trim()
                      ? "No assessors match your search."
                      : category === CATEGORY_NONE
                        ? "Every assessor is assigned to a course."
                        : "No assessors in this category yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <AssessorForm
          assessor={form === "new" ? null : form}
          busy={busy}
          error={formError}
          onCancel={() => setForm(null)}
          onSave={saveAssessor}
        />
      ) : null}

      {deleteConfirm}
    </div>
  );
}

export default AssessorsManagement;
