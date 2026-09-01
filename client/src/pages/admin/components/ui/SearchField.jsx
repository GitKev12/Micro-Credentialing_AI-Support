import { CheckIcon, CloseIcon, SearchIcon } from "../icons";

/**
 * Filter field for the list screens.
 *
 * The clear button is ours rather than the one `type="search"` gives you:
 * WebKit and Blink draw a small unstyled grey cross that ignores the design
 * system, and Firefox draws nothing at all, so the control looked different
 * depending on the browser and was missing in one of them.
 *
 * `hint` is optional and is where a screen reports how much its filter
 * matched — typing into a search that silently narrows a list below the fold
 * leaves you guessing whether it did anything.
 *
 * `notice` is the receipt for the last write — `{ tone, text }`, the shape
 * `useNotice` holds. It rides the right of this row rather than sitting above
 * the table, where a notice arriving and clearing shunted the whole list down
 * and back. Every list screen rendered the same block itself; it lives here
 * now so the four cannot drift apart.
 */
export function SearchField({ value, onChange, placeholder, label, hint, notice }) {
  return (
    <div className="admin-search">
      <div className="admin-search__field">
        <span className="admin-search__icon">
          <SearchIcon />
        </span>
        <input
          className="admin-search__input"
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <button
            type="button"
            className="admin-search__clear"
            onClick={() => onChange("")}
            aria-label="Clear search"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
      {hint && value ? <span className="admin-search__hint">{hint}</span> : null}

      {notice ? (
        <p
          className={`admin-notice admin-notice--inline admin-notice--${notice.tone}`}
          role="status"
        >
          {notice.tone === "ok" ? (
            <span className="admin-notice__icon">
              <CheckIcon size={14} />
            </span>
          ) : null}
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
