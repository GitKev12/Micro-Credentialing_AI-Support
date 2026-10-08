import { useState } from "react";
import { ArchiveIcon, LockIcon, StudentsIcon, TrashIcon } from "../icons";
import { AdminButton, AdminField, AdminModal, AdminSelect, PathwayChoice } from "../ui";
import { classTitle, sectionOptions } from "./classText";
import ClassRoster from "./ClassRoster";
import { EnrollmentChoice } from "./EnrollmentChoice";
import RequestsPanel from "./RequestsPanel";
import PeoplePicker from "./PeoplePicker";
import { MAX_LENGTH } from "../../../../lib/fieldRules";

/**
 * Create or edit a class.
 *
 * One form for both: the fields are identical, so a second near-copy would just
 * be a second place to fix. A class is a section — one course and one assessor,
 * both chosen from a dropdown — and the students are tagged from a panel, any
 * number of them. The schedule is three plain labels, shown on the class and
 * never used to gate anything.
 *
 * The section is a dropdown too, and the one optional choice on the form. A
 * course taught to a single cohort has no sections to tell apart, so requiring
 * a name there only bought a typed restatement of the course. Left unset, the
 * class is listed under its course code — see `classTitle`.
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
 * The pathway sits directly under the course: the course says which subject
 * the class is for, and the pathway says what being in it involves.
 *
 * Once a class is created, only its assessor, students and schedule can
 * change. The section, course and pathway are shown locked on the edit form.
 *
 * Deleting lives at the bottom of the edit form rather than on the list row.
 * On the row it sat one careless click from a roster, beside a Manage that did
 * something ordinary; here it is somewhere the admin arrived deliberately,
 * under everything the class holds — which is the thing being weighed. It is
 * absent while creating: there is nothing yet to destroy.
 */
function ClassForm({
  klass,
  courses,
  assessors,
  students,
  busy,
  error,
  onCancel,
  onArchive,
  onDelete,
  onAnswer,
  onPost,
  onSave
}) {
  const editing = Boolean(klass);
  const [name, setName] = useState(klass?.name ?? "");
  const [courseId, setCourseId] = useState(klass?.course?.id ?? "");
  const [assessorId, setAssessorId] = useState(klass?.assessors?.[0]?.id ?? "");
  const [mode, setMode] = useState(klass?.mode === "assessOnly" ? "assessOnly" : "taught");
  const [studentIds, setStudentIds] = useState((klass?.students ?? []).map((s) => s.id));
  const [enrollment, setEnrollment] = useState(klass?.enrollment === "open" ? "open" : "approval");
  // Discover requests waiting on this class. Answered at once, not on Save,
  // from a panel beside the form — opened and closed like the student picker.
  const [requests, setRequests] = useState(klass?.requests ?? []);
  const [viewingRequests, setViewingRequests] = useState(false);
  const [closingRequests, setClosingRequests] = useState(false);
  const [requestError, setRequestError] = useState(null);
  // Whether students can find the class on Discover. Changed at once by the
  // Post / Unpost button, like Archive, not on Save.
  const [posted, setPosted] = useState(klass?.posted === true);
  const [postError, setPostError] = useState(null);
  // Whether the "Unpost this class?" pop-up is open.
  const [confirmingUnpost, setConfirmingUnpost] = useState(false);
  const [schedule, setSchedule] = useState({
    days: klass?.schedule?.days ?? "",
    time: klass?.schedule?.time ?? "",
    room: klass?.schedule?.room ?? ""
  });
  const setField = (key) => (value) => setSchedule((current) => ({ ...current, [key]: value }));
  // The schedule is optional. It starts ticked only when the class has one.
  const [hasSchedule, setHasSchedule] = useState(
    Boolean(klass?.schedule?.days || klass?.schedule?.time || klass?.schedule?.room)
  );
  // Unticked saves an empty schedule, which clears an old one.
  const cleanSchedule = hasSchedule
    ? { days: schedule.days.trim(), time: schedule.time.trim(), room: schedule.room.trim() }
    : { days: "", time: "", room: "" };
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

  // Accepting enrolls the student straight away, so they join the roster here
  // too: Save sends this list, and must not take them out again.
  const answer = async (request, accept) => {
    const refusal = await onAnswer(request, accept);
    setRequestError(refusal);
    if (refusal) return;
    setRequests((list) => list.filter((row) => row.studentId !== request.studentId));
    if (accept) {
      setStudentIds((ids) => (ids.includes(request.studentId) ? ids : [...ids, request.studentId]));
    }
  };

  const post = async (next) => {
    const refusal = await onPost(next, enrollment);
    setConfirmingUnpost(false);
    setPostError(refusal);
    if (refusal) return;
    setPosted(next);
  };

  const closeRequests = () => setClosingRequests(true);
  const requestsClosed = () => {
    setViewingRequests(false);
    setClosingRequests(false);
    setRequestError(null);
  };
  // A side panel is open (and not on its way out), so the form moves aside for it.
  const paired = (picking && !closingPicker) || (viewingRequests && !closingRequests);

  // Only a posted class takes requests, so the button shows on those (or on a
  // class that still holds some from before it was unposted).
  const requestsButton =
    editing && (posted || requests.length > 0) ? (
      <button
        type="button"
        className="admin-chip-btn admin-chip-btn--icon admin-roster-requests"
        disabled={busy || requests.length === 0}
        onClick={() => setViewingRequests(true)}
        aria-label={`Requests, ${requests.length} waiting`}
      >
        Requests
        <span className="admin-roster-requests__count">{requests.length}</span>
      </button>
    ) : null;

  // The section is optional, so it is not one of the answers save waits for.
  const ready = courseId && assessorId;

  return (
    <>
      <AdminModal
        title={editing ? "Edit class" : "New class"}
        subtitle={editing ? classTitle(klass) : null}
        // Slides out from under the picker while it is open, so the two sit side
        // by side rather than one over the other.
        // Dropped the moment the panel starts leaving, so the form travels back
        // alongside it rather than after it.
        tone={paired ? "admin-modal__panel--paired" : ""}
        onClose={picking || viewingRequests || confirmingUnpost ? () => {} : onCancel}
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
                onSave(
                  // An edit sends only what can still change.
                  editing
                    ? { assessorIds: [assessorId], studentIds, schedule: cleanSchedule, enrollment }
                    : {
                        name: name.trim(),
                        courseId,
                        // Still sent as a list, because the field it is stored in
                        // is one. Save is closed until it holds a name.
                        assessorIds: [assessorId],
                        mode,
                        studentIds,
                        schedule: cleanSchedule,
                        enrollment
                      }
                )
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

        {editing ? (
          <p className="admin-notice admin-class-locked">
            <LockIcon /> Only the assessor, students, schedule and enrollment can be changed after a class is created.
          </p>
        ) : null}

        <div className="admin-field">
          <div className="admin-field__label">Section</div>
          <AdminSelect
            value={name}
            disabled={editing}
            onChange={setName}
            options={sectionOptions}
            label="Section"
            placeholder="No section"
          />
        </div>

        <div className="admin-field">
          <div className="admin-field__label">
            Course<span className="admin-field__required"> *</span>
          </div>
          <AdminSelect
            value={courseId}
            disabled={editing}
            onChange={setCourseId}
            options={courseOptions}
            label="Course"
            placeholder="Choose a course…"
          />
        </div>

        <PathwayChoice value={mode} disabled={busy || editing} onChange={setMode} />

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
          extra={requestsButton}
        />

        <label className="admin-check">
          <input
            type="checkbox"
            checked={hasSchedule}
            onChange={(event) => setHasSchedule(event.target.checked)}
          />
          Add a schedule
        </label>

        {hasSchedule ? (
          <div className="admin-form-grid">
            <AdminField
              label="Days"
              maxLength={MAX_LENGTH.schedule}
              value={schedule.days}
              onChange={setField("days")}
              placeholder="e.g. MWF"
            />
            <AdminField
              label="Time"
              maxLength={MAX_LENGTH.schedule}
              value={schedule.time}
              onChange={setField("time")}
              placeholder="e.g. 09:00–10:00"
            />
            <AdminField
              label="Room"
              maxLength={MAX_LENGTH.schedule}
              value={schedule.room}
              onChange={setField("room")}
              placeholder="e.g. Lab 201"
            />
          </div>
        ) : null}

        <EnrollmentChoice value={enrollment} disabled={busy} onChange={setEnrollment} />

        {editing && !klass.archived ? (
          <div className="admin-field admin-class-discover">
            <div className="admin-field__label">Discover</div>
            {/* Just the one move: the button's word says which state the class is in. */}
            <div className="admin-class-discover__row">
              {posted ? (
                <button
                  type="button"
                  className="admin-chip-btn admin-chip-btn--quiet admin-class-discover__btn"
                  disabled={busy}
                  onClick={() => setConfirmingUnpost(true)}
                >
                  Unpost
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-chip-btn admin-class-discover__btn admin-class-discover__btn--post"
                  disabled={busy || Boolean(klass.refusal)}
                  onClick={() => post(true)}
                >
                  Post to Discover
                </button>
              )}
            </div>
            {postError ? (
              <p className="admin-field__hint admin-field__hint--error" role="alert">
                {postError}
              </p>
            ) : klass.refusal ? (
              <p className="admin-field__hint">{klass.refusal}</p>
            ) : null}
          </div>
        ) : null}

        {/* Archiving switches the class off and hides it; restoring brings it back.
            Delete only shows once the class is archived. */}
        {editing && onArchive ? (
          <section className="admin-danger">
            <h3 className="admin-danger__title">Danger Zone</h3>
            <div className="admin-danger__actions">
              <button
                type="button"
                className="admin-chip-btn admin-chip-btn--danger admin-danger__btn"
                disabled={busy}
                onClick={() => onArchive(!klass.archived)}
              >
                <ArchiveIcon size={14} />
                {klass.archived ? "Restore class" : "Archive class"}
              </button>
              {klass.archived && onDelete ? (
                <button
                  type="button"
                  className="admin-chip-btn admin-chip-btn--danger admin-danger__btn"
                  disabled={busy}
                  onClick={onDelete}
                >
                  <TrashIcon size={14} />
                  Delete class
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {viewingRequests ? (
          <RequestsPanel
            requests={requests}
            classLabel={classTitle(klass)}
            busy={busy}
            error={requestError}
            closing={closingRequests}
            onAnswer={answer}
            onClose={closeRequests}
            onClosed={requestsClosed}
          />
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

      {/* Asked first, so a stray click can't take the class off Discover. */}
      {confirmingUnpost ? (
        <AdminModal
          title="Unpost this class?"
          subtitle={classTitle(klass)}
          onClose={busy ? () => {} : () => setConfirmingUnpost(false)}
          footer={
            <>
              <button
                type="button"
                className="admin-chip-btn admin-chip-btn--quiet"
                disabled={busy}
                onClick={() => setConfirmingUnpost(false)}
              >
                Cancel
              </button>
              <AdminButton variant="admin-btn--compact" disabled={busy} onClick={() => post(false)}>
                {busy ? "Unposting…" : "Unpost"}
              </AdminButton>
            </>
          }
        >
          <p className="admin-modal__lead">Students won't find it on Discover until you post it again.</p>
          {requests.length > 0 ? (
            <p className="admin-modal__lead">Waiting requests stay, so you can still accept or decline them.</p>
          ) : null}
        </AdminModal>
      ) : null}
    </>
  );
}

export default ClassForm;
