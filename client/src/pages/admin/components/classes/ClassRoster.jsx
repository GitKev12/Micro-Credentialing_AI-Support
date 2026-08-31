import { CloseIcon, PlusIcon } from "../icons";

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
            {disabled ? <span className="admin-roster-add__note">{hint}</span> : null}
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

export default ClassRoster;
