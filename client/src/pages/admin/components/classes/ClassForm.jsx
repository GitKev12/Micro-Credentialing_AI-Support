import { useState } from "react";
import { StudentsIcon, TrashIcon } from "../icons";
import { AdminButton, AdminField, AdminModal, AdminSelect } from "../ui";
import ClassRoster from "./ClassRoster";
import PeoplePicker from "./PeoplePicker";

/**
 * Create or edit a class.
 *
 * One form for both: the fields are identical, so a second near-copy would just
 * be a second place to fix. A class is a section — one course and one assessor,
 * both chosen from a dropdown — and the students are tagged from a panel, any
 * number of them. The schedule is three plain labels, shown on the class and
 * never used to gate anything.
 *
 * The assessor used to be a tagged roster like the students, which said a class
 * could have several, and optional, which said it could have none. It is one,
 * and it is required: a section with nobody in front of it is a timetable entry.
 * A dropdown says so by being one, rather than by letting the admin tick four
 * names and then refusing the save — and it now matches the course field
 * directly above it, which is the other single required choice on the form.
 *
 * The same assessor may still hold another section, of this course or any
 * other, so every assessor is offered here and none are held back.
 *
 * Deleting lives at the bottom of the edit form rather than on the list row.
 * On the row it sat one careless click from a roster, beside a Manage that did
 * something ordinary; here it is somewhere the admin arrived deliberately,
 * under everything the class holds — which is the thing being weighed. It is
 * absent while creating: there is nothing yet to destroy.
 *
 * `confirming` is true while the confirmation it opens is on screen. The form
 * stops answering Escape and backdrop clicks for as long as that is up, so one
 * press cannot dismiss both dialogs and leave the admin wondering which of
 * them it answered.
 */
function ClassForm({
  klass,
  courses,
  assessors,
  students,
  busy,
  error,
  confirming = false,
  onCancel,
  onDelete,
  onSave
}) {
  const editing = Boolean(klass);
  const [name, setName] = useState(klass?.name ?? "");
  const [courseId, setCourseId] = useState(klass?.course?.id ?? "");
  const [assessorId, setAssessorId] = useState(klass?.assessors?.[0]?.id ?? "");
  const [studentIds, setStudentIds] = useState((klass?.students ?? []).map((s) => s.id));
  const [schedule, setSchedule] = useState({
    days: klass?.schedule?.days ?? "",
    time: klass?.schedule?.time ?? "",
    room: klass?.schedule?.room ?? ""
  });
  const setField = (key) => (value) => setSchedule((current) => ({ ...current, [key]: value }));
  // Whether the student panel is open, and whether it is on its way out —
  // which it stays mounted for.
  const [picking, setPicking] = useState(false);
  const [closingPicker, setClosingPicker] = useState(false);

  const closePicker = () => setClosingPicker(true);
  const pickerClosed = () => {
    setPicking(false);
    setClosingPicker(false);
  };

  const courseOptions = courses.map((course) => ({
    value: course.id,
    label: course.title || course.code,
    meta: course.code
  }));

  /**
   * No empty row: a class must have an assessor, so there is nothing to choose
   * that means "nobody". A class saved before the rule opens with the
   * placeholder showing and cannot be saved again until one is picked, which is
   * how those get fixed.
   */
  const assessorOptions = assessors.map((assessor) => ({
    value: assessor.id,
    label: assessor.name,
    meta: assessor.assessorNumber ?? assessor.email ?? undefined
  }));

  // The students this class already has. They are enrolled in its course, so
  // without this the panel would read them as somebody else's and lock the
  // class out of editing its own roster.
  const ownStudentIds = (klass?.students ?? []).map((s) => s.id);

  const ready = name.trim() && courseId && assessorId;

  return (
    <AdminModal
      title={editing ? "Edit class" : "New class"}
      subtitle={editing ? klass.name : null}
      // Slides out from under the picker while it is open, so the two sit side
      // by side rather than one over the other.
      // Dropped the moment the panel starts leaving, so the form travels back
      // alongside it rather than after it.
      tone={picking && !closingPicker ? "admin-modal__panel--paired" : ""}
      onClose={picking || confirming ? () => {} : onCancel}
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
                // Still sent as a list, because the field it is stored in is
                // one. Save is closed until it holds a name, so it is never
                // empty by the time it gets here.
                assessorIds: [assessorId],
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
      </div>

      <div className="admin-field">
        <div className="admin-field__label">
          Assessor<span className="admin-field__required"> *</span>
        </div>
        <AdminSelect
          value={assessorId}
          onChange={setAssessorId}
          options={assessorOptions}
          label="Assessor"
          placeholder="Choose an assessor…"
        />
      </div>

      <ClassRoster
        label="Students"
        noun="students"
        action="Enroll"
        icon={<StudentsIcon size={18} />}
        people={students}
        ids={studentIds}
        onChange={setStudentIds}
        onAdd={() => setPicking(true)}
        busy={busy}
        disabled={!courseId}
        hint="Choose a course first."
      />

      <div className="admin-field">
        <div className="admin-field__label">Schedule</div>
        <div className="admin-form-grid">
          <AdminField label="Days" value={schedule.days} onChange={setField("days")} placeholder="e.g. MWF" />
          <AdminField label="Time" value={schedule.time} onChange={setField("time")} placeholder="e.g. 09:00–10:00" />
          <AdminField label="Room" value={schedule.room} onChange={setField("room")} placeholder="e.g. Lab 201" />
        </div>
      </div>

      {editing && onDelete ? (
        <section className="admin-danger">
          <h3 className="admin-danger__title">Danger Zone</h3>
          <button
            type="button"
            className="admin-chip-btn admin-chip-btn--danger admin-danger__btn"
            disabled={busy}
            onClick={() => onDelete(klass)}
          >
            <TrashIcon />
            Delete class
          </button>
        </section>
      ) : null}

      {picking ? (
        <PeoplePicker
          people={students}
          courseId={courseId}
          courseLabel={courseOptions.find((option) => option.value === courseId)?.label ?? ""}
          selected={studentIds}
          ownIds={ownStudentIds}
          closing={closingPicker}
          onApply={(ids) => {
            setStudentIds(ids);
            closePicker();
          }}
          onClose={closePicker}
          onClosed={pickerClosed}
        />
      ) : null}
    </AdminModal>
  );
}

export default ClassForm;
