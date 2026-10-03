import { useEffect, useMemo, useState } from "react";
import {
  createAssessor,
  fetchAssessor,
  fetchAssessors,
  fetchCourses,
  setAssessorStatus,
  setAssessorSuspended,
  updateAssessor
} from "../../services/admin";
import { AssessorsIcon } from "./components/icons";
import {
  AdminButton,
  chosenOption,
  Avatar,
  FILTER_ALL,
  ListFilter,
  PageHeader,
  passesFilter,
  SearchField,
  StatusMenu,
  AccountStatusPill,
  accountStatusOf,
  useListFilter,
  Pagination,
  usePagination,
  NewPasswordModal
} from "./components/ui";
import { SkeletonTable } from "../../components/Skeleton";
import AssessorDetail from "./components/assessors/AssessorDetail";
import AssessorForm from "./components/assessors/AssessorForm";
import {
  activityKindLabel,
  EMPTY_WORKLOAD
} from "./components/assessors/assessorText";
import { formatDate } from "./lib/format";
import { useLatestRequest } from "../../lib/useLatestRequest";
import { useNotice } from "../../lib/useNotice";

// The course option that is not a course: everyone holding none at all.
const NONE = "none";

const statusOf = accountStatusOf;

function AssessorsManagement() {
  const [assessors, setAssessors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const filter = useListFilter("course");

  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  // The result of the last write, which is now only an edit to the assessor's
  // own details. A write that failed used to leave no trace on screen at all.
  const [notice, setNotice] = useNotice();

  // The assessor whose details are being corrected, if any.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  // The new ID number and password, shown once after saving.
  const [newLogin, setNewLogin] = useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchAssessors(), fetchCourses()])
      .then(([assessorData, courseList]) => {
        if (!active) return;
        setAssessors(assessorData.assessors);
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
        const { assessor: created, password } = await createAssessor(values);
        // Re-read rather than append: the list is sorted by name on the server,
        // so an appended row sits at the bottom until the next load and then
        // jumps.
        const fresh = await fetchAssessors();
        setAssessors(fresh.assessors);
        setNotice({ tone: "ok", text: `${created.name} was added.` });
        setNewLogin({ title: "Assessor created", name: created.name, idNumber: created.assessorNumber, password });
      } else {
        const { assessor: saved, password } = await updateAssessor(form.id, values);
        if (password) {
          setNewLogin({ title: "New password", name: saved.name, idNumber: saved.assessorNumber, password });
        }
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
        text: `${assessor.name} is now ${next ? "inactive" : "active"}.`
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
  /**
   * The two things a assessors list is narrowed by: the course they hold, and
   * whether the account is still open. Course first, being the one an admin
   * comes to this screen with; status answers a different question about the
   * same person and used to need a read of every row to answer.
   *
   * Every course is offered whether or not anyone holds it — that nobody does
   * is the answer to a question this screen is opened with.
   */
  // Set a assessor to active, inactive or archived from the 3-dots menu.
  const changeStatus = async (assessor, status) => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await setAssessorStatus(assessor.id, status);
      const flags = { suspended: saved.suspended, archived: saved.archived };
      setAssessors((list) => list.map((row) => (row.id === assessor.id ? { ...row, ...flags } : row)));
      setNotice({ tone: "ok", text: `${assessor.name} is now ${status}.` });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.response?.data?.message || "Couldn't change this assessor's status."
      });
    } finally {
      setBusy(false);
    }
  };

  const fields = useMemo(() => {
    // Archived assessors only count under "Archived".
    const current = assessors.filter((row) => !row.archived);
    const all = { value: FILTER_ALL, label: "All assessors", meta: `${current.length}` };

    const perCourse = new Map(courses.map((course) => [course.id, 0]));
    let withoutCourse = 0;
    let inactive = 0;

    for (const assessor of current) {
      if (assessor.suspended) inactive += 1;

      const assigned = assessor.assigned ?? [];
      if (assigned.length === 0) withoutCourse += 1;
      assigned.forEach((course) =>
        perCourse.set(course.id, (perCourse.get(course.id) ?? 0) + 1)
      );
    }

    return [
      {
        id: "course",
        label: "Course",
        options: [
          all,
          ...courses.map((course) => ({
            value: course.id,
            label: course.title || course.code,
            meta: `${course.code} · ${perCourse.get(course.id) ?? 0}`,
            empty: "No assessor on this course yet."
          })),
          {
            value: NONE,
            label: "Not assigned to any course",
            meta: `${withoutCourse}`,
            empty: "Every assessor is assigned to a course."
          }
        ],
        match: (assessor, value) => {
          const assigned = assessor.assigned ?? [];
          return value === NONE
            ? assigned.length === 0
            : assigned.some((course) => course.id === value);
        }
      },
      {
        id: "status",
        label: "Status",
        options: [
          all,
          {
            value: "active",
            label: "Active",
            meta: `${current.length - inactive}`,
            empty: "Every assessor is inactive."
          },
          {
            value: "inactive",
            label: "Inactive",
            meta: `${inactive}`,
            empty: "No assessor is inactive."
          },
          {
            value: "archived",
            label: "Archived",
            meta: `${assessors.length - current.length}`,
            empty: "No assessor is archived."
          }
        ],
        match: (assessor, value) => statusOf(assessor) === value
      }
    ];
  }, [assessors, courses]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return assessors.filter((assessor) => {
      // The filter narrows first, so the search only ever runs over the rows
      // already on screen.
      // Archived assessors only show when the Archived filter is picked.
      if (assessor.archived && !(filter.field === "status" && filter.value === "archived")) {
        return false;
      }
      if (!passesFilter(fields, filter.field, filter.value, assessor)) return false;
      if (!term) return true;

      return `${assessor.name} ${assessor.assessorNumber ?? ""} ${assessor.email ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [assessors, query, fields, filter.field, filter.value]);

  // 10 rows per page; back to page 1 when the search or filter changes.
  const { pageRows, page, pageCount, setPage } = usePagination(visible, `${query}|${filter.field}|${filter.value}`);

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
        onToggleSuspended={() => toggleSuspended(selected)}
        onCancelForm={() => setForm(null)}
        onSave={saveAssessor}
      />
      </>
    );
  }

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Assessors Management"
        icon={AssessorsIcon}
      />

      {/* Filter first, then type. Dropdowns rather than a row of chips: they
          hold any number of courses without growing sideways. */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__filter admin-toolbar__filter--wide">
          <ListFilter fields={fields} noun="assessors" {...filter} />
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
                <th className="admin-col-id">Assessor #</th>
                <th>Assessor</th>
                <th className="is-center">Courses</th>
                <th className="is-center">Students</th>
                <th className="is-center">To post</th>
                <th className="is-center">To issue</th>
                <th>Last active</th>
                <th className="is-center">Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((assessor) => {
                const workload = assessor.workload ?? EMPTY_WORKLOAD;
                const active = formatDate(assessor.lastActive?.at);
                const activeKind = activityKindLabel(assessor.lastActive?.kind);

                return (
                  <tr
                    key={assessor.id}
                    className={assessor.suspended ? "is-inactive" : ""}
                    onClick={() => openAssessor(assessor.id)}
                  >
                    {/* Its own column, for the same reason the student's is:
                        a number read down a column has to be in the same place
                        on every row. */}
                    <td className="admin-col-id">
                      {assessor.assessorNumber ?? <span className="admin-cell__quiet">—</span>}
                    </td>

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
                          {assessor.assessorNumber ? null : (
                            <div className="admin-person__id">{assessor.email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="is-center">
                      <span
                        className={`admin-count${
                          assessor.assigned.length > 0 ? "" : " admin-count--none"
                        }`}
                      >
                        {assessor.assigned.length}
                      </span>
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
                        <span className="admin-count admin-count--none">0</span>
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
                      <AccountStatusPill status={statusOf(assessor)} />
                    </td>
                    <td className="admin-table__chevron">
                      <StatusMenu
                        name={assessor.name}
                        status={statusOf(assessor)}
                        busy={busy}
                        onChange={(status) => changeStatus(assessor, status)}
                      />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  {/* A filtered-to-nothing table says something different from
                      a search that missed, and an admin needs to know which
                      of the two they are looking at. */}
                  <td colSpan={9}>
                    {query.trim()
                      ? "No assessors match your search."
                      : chosenOption(fields, filter.field, filter.value)?.empty ??
                        "No assessors match this filter."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Assessors" />

      {newLogin ? <NewPasswordModal {...newLogin} onClose={() => setNewLogin(null)} /> : null}

      {form ? (
        <AssessorForm
          assessor={form === "new" ? null : form}
          busy={busy}
          error={formError}
          onCancel={() => setForm(null)}
          onSave={saveAssessor}
        />
      ) : null}
    </div>
  );
}

export default AssessorsManagement;
