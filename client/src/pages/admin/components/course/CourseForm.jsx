import { useState } from "react";

import { isRunInOrder, toDateInput } from "../../../../lib/courseDuration";
import { MAX_LENGTH, checkCourseCode, checkCourseTitle } from "../../../../lib/fieldRules";
import RangeCalendar from "../RangeCalendar";
import { AdminButton, AdminField, AdminModal } from "../ui";

/**
 * Create or rename a course.
 *
 * One form for both: the fields are identical and the only difference is
 * whether it opens empty, so two nearly-identical components would be two
 * places to fix the next time a field is added.
 */
/** Today on the admin's own calendar, as "YYYY-MM-DD". */
function todayKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function CourseForm({ course, busy, error, onCancel, onSave, children }) {
  const editing = Boolean(course);
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [startsOn, setStartsOn] = useState(toDateInput(course?.startsOn));
  const [endsOn, setEndsOn] = useState(toDateInput(course?.endsOn));

  // A course runs between two dates, so both are wanted and in that order.
  // The courses stored before the field existed have neither; the form insists
  // on them the first time one of those is opened for editing.
  // The calendar cannot express an inverted run, but a course stored before it
  // existed can still hold one, so the guard stays — it is the rule the server
  // enforces, not a message about what was just typed.
  const orderedRun = isRunInOrder(startsOn, endsOn);
  const wholeRun = Boolean(startsOn && endsOn);
  // A new course can't start in the past. Editing an existing one is left
  // alone, since a course already running started on a past day.
  const earliest = editing ? "" : todayKey();
  const notPast = !earliest || startsOn >= earliest;
  // An unchanged code is not checked again, so an older one can still be saved.
  const codeChanged = !editing || code.trim() !== course.code;
  const codeError = code && codeChanged ? checkCourseCode(code) : null;
  const titleError = title ? checkCourseTitle(title) : null;
  const ready =
    (codeChanged ? !checkCourseCode(code) : true) &&
    !checkCourseTitle(title) &&
    wholeRun &&
    orderedRun &&
    notPast;

  return (
    <AdminModal
      title={editing ? "Edit course" : "New course"}
      subtitle={editing ? course.code : null}
      onClose={onCancel}
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
                code: code.trim(),
                title: title.trim(),
                description: description.trim(),
                // Sent even when blank: an empty string is how the admin
                // clears a date they set earlier.
                startsOn,
                endsOn
              })
            }
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create course"}
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
        label="Course code"
        maxLength={MAX_LENGTH.courseCode}
        value={code}
        onChange={setCode}
        placeholder="e.g. CC2"
        error={codeError}
        required
      />
      <AdminField
        label="Course title"
        maxLength={MAX_LENGTH.courseTitle}
        value={title}
        onChange={setTitle}
        placeholder="e.g. Computer Programming 2"
        error={titleError}
        required
      />
      <AdminField
        label="Description"
        maxLength={MAX_LENGTH.courseDescription}
        value={description}
        onChange={setDescription}
        placeholder="What this course covers"
        multiline
        rows={5}
      />

      {/* Extra fields from the page, e.g. the course picture when editing. */}
      {children}

      {/* One field, because the two dates are one fact: the run. As a pair of
          native date inputs they were picked in separate browser popups that
          could not show the span between them, and the end could be set before
          the start and only told off afterwards. On a grid the span is the
          thing being drawn, and an inverted run cannot be expressed. */}
      <RangeCalendar
        startsOn={startsOn}
        endsOn={endsOn}
        required
        minDate={earliest}
        onChange={(run) => {
          setStartsOn(run.startsOn);
          setEndsOn(run.endsOn);
        }}
      />
    </AdminModal>
  );
}

export default CourseForm;
