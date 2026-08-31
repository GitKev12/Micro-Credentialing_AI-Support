import { CloseIcon, SearchIcon } from "../icons";

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
 */
export function SearchField({ value, onChange, placeholder, label, hint }) {
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
    </div>
  );
}
