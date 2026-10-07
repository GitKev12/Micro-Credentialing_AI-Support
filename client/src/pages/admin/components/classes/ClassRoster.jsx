import { CloseIcon, PlusIcon } from "../icons";
import { Avatar } from "../ui";

/**
 * The list of chosen people and the control that opens the picker.
 *
 * The control *is* the empty state rather than a chip underneath one. An empty
 * roster is the whole point of the block on a new class, so the row itself is
 * the button — the largest target here instead of the smallest — and it says
 * why it is closed before a course is picked at the spot the click would
 * happen, rather than as a footnote below it.
 *
 * Once people are chosen, the list is the content and the control stands on
 * its own under it. It is deliberately not bundled with the count beside the
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
  people,
  ids,
  onChange,
  onAdd,
  busy,
  disabled,
  hint,
  extra = null
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
            {disabled ? <span className="admin-roster-add__note">{hint}</span> : null}
          </span>
          <span className="admin-roster-add__plus">
            <PlusIcon size={18} />
          </span>
        </button>
        {extra}
      </div>
    );
  }

  return (
    <div className="admin-field">
      <div className="admin-field__label admin-field__label--row">
        {label}
        <span className="admin-field__count">{ids.length} selected</span>
      </div>

      {/* One row per student in a box of fixed height that scrolls, so a
          class of forty stays the same size on the form as a class of four,
          and a long name is cut short instead of pushing the form wider. */}
      <ul className="admin-roster-list">
        {chosen.map((person) => (
          <li className="admin-roster-row" key={person.id}>
            <Avatar name={person.name} />
            <span className="admin-roster-row__text">
              <span className="admin-roster-row__name" title={person.name}>
                {person.name}
              </span>
              {person.studentNumber ? (
                <span className="admin-roster-row__meta">{person.studentNumber}</span>
              ) : null}
            </span>
            <button
              type="button"
              className="admin-roster-row__remove"
              onClick={() => onChange(ids.filter((id) => id !== person.id))}
              aria-label={`Remove ${person.name}`}
              title="Remove"
              disabled={busy}
            >
              <CloseIcon size={14} />
            </button>
          </li>
        ))}
      </ul>

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
      {/* Any other control that belongs to this roster, e.g. the class's Discover requests. */}
      {extra}
    </div>
  );
}

export default ClassRoster;
