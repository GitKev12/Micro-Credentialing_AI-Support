import { useEffect, useMemo, useState } from "react";
import { StudentsIcon } from "../icons";
import { AdminButton, SearchField } from "../ui";

/**
 * The student picker — a panel beside the class form.
 *
 * Tagging a roster is one decision repeated, and a dropdown that took one name
 * per open made it feel like six decisions. The panel lists everyone at once,
 * ticks any number of them, and keeps a count in view because "how many am I
 * adding" is the question being answered.
 *
 * ── Who can be ticked ──
 *
 * A student belongs to one class per course. So anyone already in a section of
 * this course is *shown and refused* rather than hidden: hiding them raises
 * "where did Nicole go?", and the answer — she is in the other section — is the
 * one thing the admin needs. They sit behind the toggle, greyed, with their
 * boxes disabled.
 *
 * `ownIds` are the students this class already has. They are enrolled in its
 * course too, so without naming them the panel would read a class's own roster
 * as somebody else's and lock it out of editing itself. They stay in the open
 * list, ticked, and can be unticked to remove them.
 *
 * This used to serve assessors as well, in a second vocabulary. It no longer
 * does: a class has one assessor, and one is a dropdown on the form, not a
 * list of checkboxes.
 */
export function PeoplePicker({
  people,
  courseId,
  courseLabel,
  selected,
  ownIds = [],
  closing = false,
  onApply,
  onClose,
  onClosed
}) {
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

  // The parent rebuilds `ownIds` on every render, so the memo below keys off
  // its contents rather than the array itself — and reads them back out of the
  // key, so there is no reference to go stale behind it.
  const ownKey = ownIds.join(",");

  const { open, taken } = useMemo(() => {
    const term = query.trim().toLowerCase();
    const mine = new Set(ownKey ? ownKey.split(",") : []);
    // Enrolment is only ever written by a class, so being on the course means
    // being in a section of it — and any section but this one blocks the tick.
    const heldElsewhere = (person) =>
      !mine.has(person.id) &&
      (person.enrolled ?? []).some((course) => course.id === courseId);
    const matches = (person) =>
      !term || `${person.name} ${person.studentNumber ?? ""}`.toLowerCase().includes(term);

    const visible = people.filter(matches);
    return {
      open: visible.filter((person) => !heldElsewhere(person)),
      taken: visible.filter(heldElsewhere)
    };
  }, [people, query, courseId, ownKey]);

  const toggle = (id) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const count = picked.size;
  const noun = count === 1 ? "student" : "students";

  const row = (person, isTaken) => (
    <li key={person.id}>
      <label
        className={`admin-pick${picked.has(person.id) ? " is-picked" : ""}${
          isTaken ? " is-locked" : ""
        }`}
      >
        <input
          type="checkbox"
          className="admin-pick__box"
          checked={isTaken ? false : picked.has(person.id)}
          disabled={isTaken}
          onChange={() => toggle(person.id)}
        />
        <span className="admin-pick__text">
          <span className="admin-pick__name">{person.name}</span>
          <span className="admin-pick__meta">
            {person.studentNumber ?? person.email ?? "No ID number"}
            {isTaken ? " · already in this course" : ""}
          </span>
        </span>
      </label>
    </li>
  );

  return (
    <div
      className="admin-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Add students"
      onClick={onClose}
    >
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
            <h2 className="admin-drawer__title">
              <span className="admin-card__title-mark" aria-hidden="true">
                <StudentsIcon size={18} />
              </span>
              Add students
            </h2>
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
            label="Search students"
          />
        </div>

        <div className="admin-drawer__body">
          <p className="admin-drawer__group">Available for this class ({open.length})</p>

          <ul className="admin-pick-list">{open.map((person) => row(person, false))}</ul>

          {open.length === 0 ? (
            <p className="admin-empty-note">
              {query.trim()
                ? "No available student matches that search."
                : "Every student is already in a class on this course."}
            </p>
          ) : null}

          {taken.length > 0 ? (
            <>
              <button
                type="button"
                className="admin-drawer__toggle"
                onClick={() => setShowTaken((on) => !on)}
              >
                {showTaken ? "Hide" : "Show"} the {taken.length} already in this course
              </button>

              {showTaken ? (
                <>
                  <ul className="admin-pick-list">{taken.map((person) => row(person, true))}</ul>
                  {/* Said once under the group, not on every row: the greyed
                      boxes show *that* they are closed, this says why. */}
                  <p className="admin-empty-note">
                    Each of these is in another class on this course. A student can only be in one.
                  </p>
                </>
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

export default PeoplePicker;
