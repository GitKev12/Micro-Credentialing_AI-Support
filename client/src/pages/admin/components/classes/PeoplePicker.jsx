import { useEffect, useMemo, useState } from "react";
import { AdminButton, SearchField } from "../ui";

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

export default PeoplePicker;
