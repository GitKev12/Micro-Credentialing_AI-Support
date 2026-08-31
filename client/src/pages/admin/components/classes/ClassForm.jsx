import { useState } from "react";
import { AssessorsIcon, StudentsIcon } from "../icons";
import { AdminButton, AdminField, AdminModal, AdminSelect } from "../ui";
import ClassRoster from "./ClassRoster";
import PeoplePicker from "./PeoplePicker";

/**
 * Create or edit a class.
 *
 * One form for both: the fields are identical, so a second near-copy would just
 * be a second place to fix. The course is a single choice; assessors and
 * students are tagged from dropdowns, any number of each. The schedule is four
 * plain labels — shown on the class, never used to gate anything.
 */
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
      </div>

      <ClassRoster
        label="Assessors"
        noun="assessors"
        action="Assign"
        icon={<AssessorsIcon size={18} />}
        people={assessors}
        ids={assessorIds}
        onChange={setAssessorIds}
        onAdd={() => setPicking("assessor")}
        busy={busy}
        disabled={!courseId}
        hint="Choose a course first."
      />

      <ClassRoster
        label="Students"
        noun="students"
        action="Enroll"
        icon={<StudentsIcon size={18} />}
        people={students}
        ids={studentIds}
        onChange={setStudentIds}
        onAdd={() => setPicking("student")}
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

export default ClassForm;
