import { useId } from "react";
import { GROUPS, LEVELS, LEVEL_KEYS, apportion, groupItems, share, splitItems, toCount } from "./levels";

/**
 * The paper length as its Table of Specification sets it.
 *
 * This is deliberately an output rather than another input. Having a question
 * field on Generate Assessment and a question count in the blueprint created
 * two answers to one decision. The count is changed in the ToS; this control
 * keeps that plan visible at the point where it will be spent.
 */
export default function QuestionsField({ count, split, paper, onModify }) {
  const id = useId();
  const assigned = splitItems(split);

  return (
    <div className="gen-field">
      <div className="gen-field__head">
        <label className="field-label" htmlFor={id}>
          Number of questions
        </label>
        <button type="button" className="link-btn" onClick={onModify}>
          Modify TOS
        </button>
      </div>

      <div className={`q-length${assigned > 0 ? "" : " is-unplanned"}`}>
        <div className="q-length__top">
          <output id={id} className={`q-length__count${count > 0 ? "" : " is-empty"}`}>
            {count > 0 ? count : "—"}
          </output>
        </div>

        <div className="q-length__mix">
          {count > 0 && assigned > 0 ? (
            <MixFigures split={split} assigned={assigned} count={count} />
          ) : (
            <p className="gen-hint">
              {count > 0 ? "No level mix in the TOS yet." : `No TOS for this ${paper} yet.`}
            </p>
          )}
        </div>

        <LevelFloor split={split} assigned={assigned} count={count} />
      </div>
    </div>
  );
}

/** Scale a cognitive mix to a stated paper length without losing whole items. */
function atLength(split, count) {
  const spread = apportion(count, LEVEL_KEYS.map((key) => toCount(split?.[key])));
  return Object.fromEntries(LEVEL_KEYS.map((key, index) => [key, spread[index]]));
}

function MixFigures({ split, assigned, count }) {
  const spread = atLength(split, count);

  return (
    <ul className="tos-mix">
      {GROUPS.map((group) => (
        <li className="tos-mix__group" key={group.key} data-group={group.key}>
          <span className="tos-mix__label">{group.label}</span>
          <span className="tos-mix__n">{groupItems(spread, group.key)}</span>
          <span className="tos-mix__pct">{share(groupItems(split, group.key), assigned)}%</span>
        </li>
      ))}
    </ul>
  );
}

function LevelFloor({ split, assigned, count }) {
  if (!(assigned > 0) || !(count > 0)) {
    return <div className="q-length__floor" aria-hidden="true" />;
  }

  const spread = atLength(split, count);

  return (
    <div
      className="q-length__floor"
      role="img"
      aria-label={GROUPS.map(
        (group) => `${group.name}: ${groupItems(spread, group.key)} of ${count} questions.`
      ).join(" ")}
    >
      {LEVELS.map((level) => {
        const planned = toCount(split?.[level.key]);
        if (!planned) return null;

        return (
          <span
            key={level.key}
            className="tos-bar__seg"
            data-level={level.key}
            style={{ width: `${(planned / assigned) * 100}%` }}
            title={`${level.label}: ${spread[level.key]}`}
          />
        );
      })}
    </div>
  );
}
