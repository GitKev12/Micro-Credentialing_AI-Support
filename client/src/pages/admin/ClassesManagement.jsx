import { useEffect, useMemo, useState } from "react";
import {
  createClass,
  deleteClass,
  fetchClass,
  fetchClasses,
  fetchClassImpact,
  setClassActive,
  updateClass
} from "../../services/classes";
import { fetchAssessors, fetchCourses, fetchStudents } from "../../services/admin";
import {
  AssessorsIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  StudentsIcon,
  TrashIcon
} from "./components/icons";
import {
  AdminButton,
  AdminField,
  AdminModal,
  AdminSelect,
  ConfirmDeleteModal,
  PageHeader,
  SearchField
} from "./components/ui";

function errorMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

/** "1 student" / "3 students" — a count that reads as English. */
function plural(count, word, suffix = "s") {
  return `${count} ${word}${count === 1 ? "" : suffix}`;
}

/** The schedule as one line — "MWF · 09:00–10:00 · Lab 201", or nothing. */
function scheduleSummary(schedule) {
  const parts = [schedule?.days, schedule?.time, schedule?.room]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.join(" · ");
}

/**
 * What deleting a class changes. It destroys the class row and nothing else —
 * no account, no completion. What it *changes* is enrolment: the people no other
 * class still holds on this course are unenrolled or unassigned, and that is the
 * half worth spelling out, since "delete" on its own reads like it removes them.
 */
function classLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) return ["this class and its schedule"];
  return ["this class, its roster tags and schedule"];
}

function classKeeps(impact) {
  if (!impact || impact.unknown) return [];
  return [
    impact.unenroll
      ? `${plural(impact.unenroll, "student")} — unenrolled from the course, account and records stay`
      : "",
    impact.unassign
      ? `${plural(impact.unassign, "assessor")} — unassigned from the course, account stays`
      : ""
  ].filter(Boolean);
}

/**
 * Create or edit a class.
 *
 * One form for both: the fields are identical, so a second near-copy would just
 * be a second place to fix. The course is a single choice; assessors and
 * students are tagged from dropdowns, any number of each. The schedule is four
 * plain labels — shown on the class, never used to gate anything.
 */
/**
 * What the picker says, per kind of person.
 *
 * Assessors and students are the same job — tick people, add them to the class,
 * write through to their course list — and differ only in the field that says
 * which courses they already have and in the words for it. One component, two
 * vocabularies, rather than two components that drift apart.
 */
const PICKER_KINDS = {
  student: {
    title: "Add students",
    noun: ["student", "students"],
    courses: (person) => person.enrolled ?? [],
    number: (person) => person.studentNumber,
    openLabel: "Not enrolled in this course",
    takenNote: "already in this course",
    takenToggle: "already in this course",
    emptyAll: "Every student is already in this course.",
    emptySearch: "No unenrolled student matches that search."
  },
  assessor: {
    title: "Add assessors",
    noun: ["assessor", "assessors"],
    courses: (person) => person.assigned ?? [],
    number: (person) => person.assessorNumber,
    openLabel: "Not assigned to this course",
    takenNote: "already assessing this course",
    takenToggle: "already assessing this course",
    emptyAll: "Every assessor already assesses this course.",
    emptySearch: "No unassigned assessor matches that search."
  }
};

/**
 * The people picker — a panel beside the class form.
 *
 * Tagging a roster is one decision repeated, and a dropdown that took one name
 * per open made it feel like six decisions. The panel lists everyone at once,
 * ticks any number of them, and keeps a count in view because "how many am I
 * adding" is the question being answered.
 *
 * The list is whoever is *not* on the course yet — the people where ticking the
 * box actually changes something. The rest stay reachable behind a toggle
 * rather than hidden outright, since someone can be enrolled or assigned
 * directly and still belong in this class.
 */
export function PeoplePicker({
  kind = "student",
  people,
  courseId,
  courseLabel,
  selected,
  closing = false,
  onApply,
  onClose,
  onClosed
}) {
  const words = PICKER_KINDS[kind] ?? PICKER_KINDS.student;
  const [picked, setPicked] = useState(() => new Set(selected));
  const [query, setQuery] = useState("");
  const [showTaken, setShowTaken] = useState(false);

  /*
   * The unmount rides on the closing animation's animationend, which is a frame
   * event — a tab that is not being painted can defer it for as long as it is
   * in the background, and the panel would still be there when the reader came
   * back. This is the floor under that: comfortably past the animation, and
   * harmless when the event arrives on time, since it only sets state that is
   * already set.
   */
  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(onClosed, 400);
    return () => clearTimeout(timer);
  }, [closing, onClosed]);

  // Escape closes the panel, not the form beside it — the form's own handler is
  // held off while this is open (see ClassForm).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const { open, taken } = useMemo(() => {
    const term = query.trim().toLowerCase();
    const onCourse = (person) => words.courses(person).some((course) => course.id === courseId);
    const matches = (person) =>
      !term || `${person.name} ${words.number(person) ?? ""}`.toLowerCase().includes(term);

    const visible = people.filter(matches);
    return { open: visible.filter((p) => !onCourse(p)), taken: visible.filter(onCourse) };
  }, [people, query, courseId, words]);

  const toggle = (id) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const count = picked.size;
  const noun = count === 1 ? words.noun[0] : words.noun[1];

  const row = (person, isTaken) => (
    <li key={person.id}>
      <label className={`admin-pick${picked.has(person.id) ? " is-picked" : ""}`}>
        <input
          type="checkbox"
          className="admin-pick__box"
          checked={picked.has(person.id)}
          onChange={() => toggle(person.id)}
        />
        <span className="admin-pick__text">
          <span className="admin-pick__name">{person.name}</span>
          <span className="admin-pick__meta">
            {words.number(person) ?? person.email ?? "No ID number"}
            {isTaken ? ` · ${words.takenNote}` : ""}
          </span>
        </span>
      </label>
    </li>
  );

  return (
    <div className="admin-drawer" role="dialog" aria-modal="true" aria-label={words.title} onClick={onClose}>
      <aside
        className={`admin-modal__panel admin-modal__panel--form admin-drawer__panel${
          closing ? " is-closing" : ""
        }`}
        onClick={(event) => event.stopPropagation()}
        // The panel is unmounted by the animation, not by the click that asked
        // for it: leaving before it has left would take the form's shift with
        // it and snap the two apart.
        onAnimationEnd={() => {
          if (closing) onClosed();
        }}
      >
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">{words.title}</h2>
            <p className="admin-drawer__sub">{courseLabel || "This class"}</p>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {/* The count answers the question the panel is open for, so it sits
            above the list rather than only on the button at the bottom. */}
        <p className="admin-drawer__count" role="status">
          <strong>{count}</strong> {noun} selected
        </p>

        <div className="admin-drawer__search">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search name or ID number…"
            label={`Search ${words.noun[1]}`}
          />
        </div>

        <div className="admin-drawer__body">
          <p className="admin-drawer__group">
            {words.openLabel} ({open.length})
          </p>

          <ul className="admin-pick-list">{open.map((person) => row(person, false))}</ul>

          {open.length === 0 ? (
            <p className="admin-empty-note">
              {query.trim() ? words.emptySearch : words.emptyAll}
            </p>
          ) : null}

          {taken.length > 0 ? (
            <>
              <button
                type="button"
                className="admin-drawer__toggle"
                onClick={() => setShowTaken((on) => !on)}
              >
                {showTaken ? "Hide" : "Show"} the {taken.length} {words.takenToggle}
              </button>

              {showTaken ? (
                <ul className="admin-pick-list">{taken.map((person) => row(person, true))}</ul>
              ) : null}
            </>
          ) : null}
        </div>

        <footer className="admin-drawer__foot">
          <button type="button" className="admin-chip-btn admin-chip-btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <AdminButton variant="admin-btn--compact" onClick={() => onApply([...picked])}>
            {count === 0 ? "Done" : `Add ${count} ${noun}`}
          </AdminButton>
        </footer>
      </aside>
    </div>
  );
}

/**
 * The tag list and the control that opens the picker, for one kind of person.
 *
 * The control *is* the empty state rather than a chip underneath one. An empty
 * roster is the whole point of the block on a new class, so the row itself is
 * the button — the largest target here instead of the smallest — and it says
 * why it is closed before a course is picked at the spot the click would
 * happen, rather than as a footnote below it.
 *
 * Once people are tagged, the tags are the content and the control stands on
 * its own under them. It is deliberately not bundled with the count beside the
 * label: the count reports, the button acts, and a control reads as a control
 * when nothing else is sharing its corner.
 *
 * `action` is the verb this roster does — a student is enrolled, an assessor is
 * assigned. The class writes through to those two fields on save, so the button
 * says which of them it is going to write rather than a generic "Add".
 */
function ClassRoster({
  label,
  noun,
  action,
  icon,
  note,
  people,
  ids,
  onChange,
  onAdd,
  busy,
  disabled,
  hint
}) {
  const chosen = ids.map((id) => people.find((person) => person.id === id)).filter(Boolean);
  const blocked = busy || disabled;

  if (ids.length === 0) {
    return (
      <div className="admin-field">
        <div className="admin-field__label">{label}</div>

        <button type="button" className="admin-roster-add" disabled={blocked} onClick={onAdd}>
          <span className="admin-roster-add__icon">{icon}</span>
          <span className="admin-roster-add__text">
            <span className="admin-roster-add__title">
              {action} {noun}
            </span>
            <span className="admin-roster-add__note">{disabled ? hint : note}</span>
          </span>
          <span className="admin-roster-add__plus">
            <PlusIcon size={18} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="admin-field">
      <div className="admin-field__label admin-field__label--row">
        {label}
        <span className="admin-field__count">{ids.length} selected</span>
      </div>

      <div className="admin-tags">
        {chosen.map((person) => (
          <span className="admin-tag" key={person.id}>
            <span className="admin-tag__label">{person.name}</span>
            <button
              type="button"
              className="admin-tag__remove"
              onClick={() => onChange(ids.filter((id) => id !== person.id))}
              aria-label={`Remove ${person.name}`}
              disabled={busy}
            >
              <CloseIcon size={12} />
            </button>
          </span>
        ))}
      </div>

      <button
        type="button"
        className="admin-chip-btn admin-chip-btn--icon admin-roster-more"
        disabled={blocked}
        onClick={onAdd}
        aria-label={`${action} ${noun}`}
      >
        <PlusIcon size={13} />
        {action}
      </button>
    </div>
  );
}

function ClassForm({ klass, courses, assessors, students, busy, error, onCancel, onSave }) {
  const editing = Boolean(klass);
  const [name, setName] = useState(klass?.name ?? "");
  const [courseId, setCourseId] = useState(klass?.course?.id ?? "");
  const [assessorIds, setAssessorIds] = useState((klass?.assessors ?? []).map((a) => a.id));
  const [studentIds, setStudentIds] = useState((klass?.students ?? []).map((s) => s.id));
  const [schedule, setSchedule] = useState({
    days: klass?.schedule?.days ?? "",
    time: klass?.schedule?.time ?? "",
    room: klass?.schedule?.room ?? ""
  });
  const setField = (key) => (value) => setSchedule((current) => ({ ...current, [key]: value }));
  // Which roster's panel is open: "student", "assessor", or null — and
  // whether it is on its way out, which it stays mounted for.
  const [picking, setPicking] = useState(null);
  const [closingPicker, setClosingPicker] = useState(false);

  const closePicker = () => setClosingPicker(true);
  const pickerClosed = () => {
    setPicking(null);
    setClosingPicker(false);
  };

  const courseOptions = courses.map((course) => ({
    value: course.id,
    label: course.title || course.code,
    meta: course.code
  }));

  const ready = name.trim() && courseId;

  return (
    <AdminModal
      title={editing ? "Edit class" : "New class"}
      subtitle={editing ? klass.name : null}
      // Slides out from under the picker while it is open, so the two sit side
      // by side rather than one over the other.
      // Dropped the moment the panel starts leaving, so the form travels back
      // alongside it rather than after it.
      tone={picking && !closingPicker ? "admin-modal__panel--paired" : ""}
      onClose={picking ? () => {} : onCancel}
      footer={
        <>
          <button
            type="button"
            className="admin-chip-btn admin-chip-btn--quiet"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <AdminButton
            variant="admin-btn--compact"
            disabled={busy || !ready}
            onClick={() =>
              onSave({
                name: name.trim(),
                courseId,
                assessorIds,
                studentIds,
                schedule: {
                  days: schedule.days.trim(),
                  time: schedule.time.trim(),
                  room: schedule.room.trim()
                }
              })
            }
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create class"}
          </AdminButton>
        </>
      }
    >
      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      <AdminField
        label="Class name"
        value={name}
        onChange={setName}
        placeholder="e.g. CC2 — Section A"
        required
      />

      <div className="admin-field">
        <div className="admin-field__label">
          Course<span className="admin-field__required"> *</span>
        </div>
        <AdminSelect
          value={courseId}
          onChange={setCourseId}
          options={courseOptions}
          label="Course"
          placeholder="Choose a course…"
        />
        <p className="admin-field__hint">
          Everyone tagged below is enrolled in or assigned to this course when you save.
        </p>
      </div>

      <ClassRoster
        label="Assessors"
        noun="assessors"
        action="Assign"
        icon={<AssessorsIcon size={18} />}
        note="Anyone not already assigned to this course."
        people={assessors}
        ids={assessorIds}
        onChange={setAssessorIds}
        onAdd={() => setPicking("assessor")}
        busy={busy}
        disabled={!courseId}
        hint="Choose the course above first — the list is drawn from it."
      />

      <ClassRoster
        label="Students"
        noun="students"
        action="Enroll"
        icon={<StudentsIcon size={18} />}
        note="Anyone not already enrolled in this course."
        people={students}
        ids={studentIds}
        onChange={setStudentIds}
        onAdd={() => setPicking("student")}
        busy={busy}
        disabled={!courseId}
        hint="Choose the course above first — the list is drawn from it."
      />

      <div className="admin-field">
        <div className="admin-field__label">Schedule</div>
        <p className="admin-field__hint">
          A label for the timetable — shown on the class, not used to open or lock anything.
        </p>
        <div className="admin-form-grid">
          <AdminField label="Days" value={schedule.days} onChange={setField("days")} placeholder="e.g. MWF" />
          <AdminField label="Time" value={schedule.time} onChange={setField("time")} placeholder="e.g. 09:00–10:00" />
          <AdminField label="Room" value={schedule.room} onChange={setField("room")} placeholder="e.g. Lab 201" />
        </div>
      </div>

      {picking ? (
        <PeoplePicker
          kind={picking}
          people={picking === "student" ? students : assessors}
          courseId={courseId}
          courseLabel={courseOptions.find((option) => option.value === courseId)?.label ?? ""}
          selected={picking === "student" ? studentIds : assessorIds}
          closing={closingPicker}
          onApply={(ids) => {
            if (picking === "student") setStudentIds(ids);
            else setAssessorIds(ids);
            closePicker();
          }}
          onClose={closePicker}
          onClosed={pickerClosed}
        />
      ) : null}
    </AdminModal>
  );
}

function ClassesManagement() {
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [assessors, setAssessors] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // The form is "new", a loaded class object being edited, or null. `deleting`
  // is the class awaiting a "yes, delete", with its impact filled in once read.
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchClasses(), fetchCourses(), fetchStudents(), fetchAssessors()])
      .then(([classList, courseList, studentList, assessorData]) => {
        if (!active) return;
        setClasses(classList);
        setCourses(courseList);
        setStudents(studentList);
        setAssessors(assessorData.assessors ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshClasses = async () => {
    setClasses(await fetchClasses());
  };

  const openNew = () => {
    setFormError(null);
    setForm("new");
  };

  const openEdit = (cls) => {
    setFormError(null);
    setForm({ id: cls.id, loading: true });
    fetchClass(cls.id)
      .then((full) => setForm({ ...full, loading: false }))
      .catch(() => {
        setForm(null);
        setNotice({ tone: "error", text: "Couldn't load this class for editing." });
      });
  };

  const saveClass = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      if (form === "new") {
        const created = await createClass(values);
        await refreshClasses();
        setNotice({ tone: "ok", text: `“${created.name}” was created.` });
      } else {
        const saved = await updateClass(form.id, values);
        await refreshClasses();
        setNotice({ tone: "ok", text: `“${saved.name}” was updated.` });
      }
      setForm(null);
    } catch (error) {
      // Kept in the form: a missing name or course is fixed in the field the
      // admin is still looking at.
      setFormError(errorMessage(error, "Couldn't save this class. Try again."));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Run this class, or stop running it.
   *
   * Written straight from the row rather than through the form: it is one
   * field, it is reversible, and asking someone to open a modal to flip a
   * switch is the kind of step that makes a screen tiring. The row moves first
   * and goes back if the write fails, so the switch answers the click.
   */
  const toggleActive = async (cls) => {
    const next = !cls.active;
    setClasses((list) => list.map((row) => (row.id === cls.id ? { ...row, active: next } : row)));
    setBusy(true);
    try {
      await setClassActive(cls.id, next);
      setNotice({
        tone: "ok",
        text: `“${cls.name}” is now ${next ? "active" : "inactive"}.`
      });
    } catch (error) {
      setClasses((list) =>
        list.map((row) => (row.id === cls.id ? { ...row, active: cls.active } : row))
      );
      setNotice({
        tone: "error",
        text: errorMessage(error, "Couldn't change this class's status.")
      });
    } finally {
      setBusy(false);
    }
  };

  const askToDelete = (cls) => {
    setDeleting(cls);
    setImpact(null);
    fetchClassImpact(cls.id)
      .then(setImpact)
      .catch(() => setImpact({ unknown: true }));
  };

  const removeClass = async () => {
    setBusy(true);
    try {
      const removed = await deleteClass(deleting.id);
      setClasses((list) => list.filter((cls) => cls.id !== deleting.id));
      setDeleting(null);
      setImpact(null);
      const also = classKeeps(impact);
      setNotice({
        tone: "ok",
        text: `“${removed.name}” was deleted${
          also.length ? `. ${plural(impact.unenroll ?? 0, "student")} unenrolled, ${plural(impact.unassign ?? 0, "assessor")} unassigned.` : "."
        }`
      });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, "Couldn't delete this class.") });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return classes;
    return classes.filter((cls) => {
      const haystack = [
        cls.name,
        cls.course?.code,
        cls.course?.title,
        ...(cls.assessors ?? []).map((a) => a.name)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [classes, query]);

  return (
    <div className="admin-main__inner">
      <PageHeader
        title="Classes Management"
        action={
          <AdminButton onClick={openNew} disabled={status !== "ready"}>
            New class
          </AdminButton>
        }
      />

      <div className="admin-toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search classes…"
          label="Search classes"
          hint={`${visible.length} of ${classes.length}`}
        />

        {notice ? (
          <p
            className={`admin-notice admin-notice--inline admin-notice--${notice.tone}`}
            role="status"
          >
            {notice.tone === "ok" ? (
              <span className="admin-notice__icon">
                <CheckIcon size={14} />
              </span>
            ) : null}
            {notice.text}
          </p>
        ) : null}
      </div>

      {status === "loading" ? (
        <div className="admin-state-card">Loading classes…</div>
      ) : status === "error" ? (
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Course</th>
                <th>Assessors</th>
                <th className="is-center">Students</th>
                <th>Schedule</th>
                <th className="is-center">Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((cls) => {
                const schedule = scheduleSummary(cls.schedule);
                const assessorNames = (cls.assessors ?? []).map((a) => a.name);

                return (
                  <tr key={cls.id} className={cls.active ? "" : "is-inactive"}>
                    <td>
                      <button
                        type="button"
                        className="admin-person__name admin-person__link"
                        onClick={() => openEdit(cls)}
                      >
                        {cls.name}
                      </button>
                    </td>
                    <td>
                      {cls.course ? (
                        <>
                          <span className="admin-cell__quiet">{cls.course.title}</span>
                          <span className="admin-cell__sub">{cls.course.code}</span>
                        </>
                      ) : (
                        <span className="admin-count admin-count--none">No course</span>
                      )}
                    </td>
                    <td>
                      {assessorNames.length > 0 ? (
                        <span className="admin-cell__quiet">{assessorNames.join(", ")}</span>
                      ) : (
                        <span className="admin-count admin-count--none">None</span>
                      )}
                    </td>
                    <td className="is-center">
                      {cls.studentCount > 0 ? (
                        <span className="admin-count">{cls.studentCount}</span>
                      ) : (
                        <span className="admin-count admin-count--none">None</span>
                      )}
                    </td>
                    <td>
                      {schedule ? (
                        <span className="admin-cell__quiet">{schedule}</span>
                      ) : (
                        <span className="admin-cell__quiet">—</span>
                      )}
                    </td>
                    <td className="is-center">
                      <button
                        type="button"
                        className={`admin-switch${cls.active ? " is-on" : ""}`}
                        role="switch"
                        aria-checked={Boolean(cls.active)}
                        disabled={busy}
                        onClick={() => toggleActive(cls)}
                        title={
                          cls.active
                            ? `Stop running ${cls.name}`
                            : `Start running ${cls.name}`
                        }
                      >
                        <span className="admin-switch__track">
                          <span className="admin-switch__thumb" />
                        </span>
                        <span className="admin-switch__label">
                          {cls.active ? "Active" : "Inactive"}
                        </span>
                      </button>
                    </td>
                    <td className="admin-table__actions">
                      <button
                        type="button"
                        className="admin-chip-btn admin-chip-btn--quiet"
                        disabled={busy}
                        onClick={() => openEdit(cls)}
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        className="admin-chip-btn admin-chip-btn--icon admin-chip-btn--danger"
                        disabled={busy}
                        onClick={() => askToDelete(cls)}
                        aria-label={`Delete ${cls.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="admin-table__empty">
                  <td colSpan={7}>
                    {query.trim()
                      ? "No classes match your search."
                      : "No classes yet. Create one to enrol students and assign assessors together."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {form === "new" ? (
        <ClassForm
          klass={null}
          courses={courses}
          assessors={assessors}
          students={students}
          busy={busy}
          error={formError}
          onCancel={() => setForm(null)}
          onSave={saveClass}
        />
      ) : null}

      {form && form !== "new" && form.loading ? (
        <AdminModal title="Edit class" onClose={() => setForm(null)}>
          <p className="admin-empty-note">Loading class…</p>
        </AdminModal>
      ) : null}

      {form && form !== "new" && !form.loading ? (
        <ClassForm
          klass={form}
          courses={courses}
          assessors={assessors}
          students={students}
          busy={busy}
          error={formError}
          onCancel={() => setForm(null)}
          onSave={saveClass}
        />
      ) : null}

      {deleting ? (
        <ConfirmDeleteModal
          title="Delete this class?"
          subject={deleting.name}
          losses={classLosses(impact)}
          keeps={classKeeps(impact)}
          busy={busy}
          confirmLabel="Delete class"
          onCancel={() => {
            setDeleting(null);
            setImpact(null);
          }}
          onConfirm={removeClass}
        />
      ) : null}
    </div>
  );
}

export default ClassesManagement;
