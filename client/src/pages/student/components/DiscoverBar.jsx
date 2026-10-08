import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, SearchIcon } from "./icons";

/** The Filter dropdown's three groups, in the order they are shown. */
export const FILTER_GROUPS = [
  {
    id: "status",
    label: "My status",
    options: [
      { value: "none", label: "Not enrolled" },
      { value: "enrolled", label: "Enrolled" },
      { value: "pending", label: "Request pending" }
    ]
  },
  {
    id: "join",
    label: "How to join",
    options: [
      { value: "open", label: "Open" },
      { value: "approval", label: "Needs approval" }
    ]
  },
  {
    id: "pathway",
    label: "Pathway",
    options: [
      { value: "taught", label: "Taught and assessed" },
      { value: "assessOnly", label: "Assess-only" }
    ]
  }
];

export const NO_FILTERS = { status: [], join: [], pathway: [] };

const statusOf = (course) => (course.enrolled ? "enrolled" : course.pending ? "pending" : "none");
// Nothing ticked in a group means the group lets everything through.
const fits = (wanted, value) => wanted.length === 0 || wanted.includes(value);

/**
 * Whether a course card passes the search, the category and the filters.
 * Within a group any ticked box can match; across groups all must. How to
 * join and Pathway are checked on one section, so "Open" with "Assess-only"
 * means a section that is both.
 */
export function matchesDiscover(course, { query, category, ticked }) {
  const term = query.trim().toLowerCase();
  const text = `${course.code} ${course.title} ${course.category ?? ""}`.toLowerCase();
  if (term && !text.includes(term)) return false;
  if (category && course.category !== category) return false;
  if (!fits(ticked.status, statusOf(course))) return false;
  if (ticked.join.length === 0 && ticked.pathway.length === 0) return true;
  return (course.openSections ?? []).some(
    (section) => fits(ticked.join, section.enrollment) && fits(ticked.pathway, section.mode)
  );
}

/**
 * The search bar at the top of Discover: a search box, a Category dropdown
 * (pick one) and a Filter dropdown (tick boxes). Only one dropdown is open at
 * a time; a click outside or Escape closes it.
 */
export default function DiscoverBar({ query, onQuery, courseCount, categories, category, onCategory, ticked, onTick, onClear }) {
  const [open, setOpen] = useState(null); // "category", "filter" or null
  const barRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!barRef.current?.contains(event.target)) setOpen(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (name) => setOpen((current) => (current === name ? null : name));
  const tickedCount = FILTER_GROUPS.reduce((total, group) => total + ticked[group.id].length, 0);

  const choose = (value) => {
    onCategory(value);
    setOpen(null);
  };
  // Options are list rows, so Enter and Space pick them like a click.
  const pickWithKeys = (value) => (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(value);
    }
  };

  // "All categories" counts every course, including ones with no category.
  const options = [{ value: "", label: "All categories", count: courseCount }, ...categories];

  return (
    <section className="sd-dbar" aria-label="Search and filter courses" ref={barRef}>
      <label className="sd-dbar__search">
        <span className="sd-dbar__search-icon" aria-hidden="true">
          <SearchIcon size={18} />
        </span>
        <input
          className="sd-dbar__input"
          type="search"
          placeholder="Search courses…"
          aria-label="Search courses"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>

      <div className="sd-dbar__menu">
        <button
          type="button"
          className="sd-dbar__trigger"
          aria-haspopup="listbox"
          aria-expanded={open === "category"}
          onClick={() => toggle("category")}
        >
          <span className="sd-dbar__trigger-label">{category || "Category"}</span>
          <span className="sd-dbar__caret" aria-hidden="true">
            <ChevronDownIcon size={16} />
          </span>
        </button>
        {open === "category" ? (
          <ul className="sd-dbar__list" role="listbox" aria-label="Category">
            {options.map((option) => (
              <li
                key={option.value || "all"}
                className="sd-dbar__option"
                role="option"
                tabIndex={0}
                aria-selected={category === option.value}
                onClick={() => choose(option.value)}
                onKeyDown={pickWithKeys(option.value)}
              >
                <span className="sd-dbar__option-label">{option.label}</span>
                <span className="sd-dbar__option-count">{option.count}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="sd-dbar__menu">
        <button
          type="button"
          className="sd-dbar__trigger sd-dbar__trigger--filter"
          aria-haspopup="dialog"
          aria-expanded={open === "filter"}
          onClick={() => toggle("filter")}
        >
          <span className="sd-dbar__trigger-label">Filter</span>
          {tickedCount > 0 ? (
            <span className="sd-dbar__badge" aria-label={`${tickedCount} selected`}>
              {tickedCount}
            </span>
          ) : null}
          <span className="sd-dbar__caret" aria-hidden="true">
            <ChevronDownIcon size={16} />
          </span>
        </button>
        {open === "filter" ? (
          <div className="sd-dbar__panel" role="dialog" aria-label="Filter">
            {FILTER_GROUPS.map((group) => (
              <fieldset className="sd-dbar__group" key={group.id}>
                <legend className="sd-dbar__legend">{group.label}</legend>
                {group.options.map((option) => (
                  <label className="sd-dbar__check" key={option.value}>
                    <input
                      type="checkbox"
                      checked={ticked[group.id].includes(option.value)}
                      onChange={() => onTick(group.id, option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="sd-dbar__panel-foot">
              <button type="button" className="sd-btn sd-btn--sm" disabled={tickedCount === 0} onClick={onClear}>
                Clear all
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
