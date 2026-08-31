/**
 * The wording helpers the admin screens share.
 *
 * Each of these was written out again in every screen that needed it —
 * `errorMessage` and `plural` twice, `formatDate` twice, character for
 * character. Four copies of one sentence is four places to fix when the
 * sentence is wrong, and the screens had already begun to drift apart on
 * smaller things.
 */

/** "Aug 4, 2026", or nothing at all for a missing or unparseable date. */
export function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "1 lesson" / "3 lessons" — a count that reads as English. */
export function plural(count, word, suffix = "s") {
  return `${count} ${word}${count === 1 ? "" : suffix}`;
}

/** "a, b and c" — an English list, not a comma-separated dump. */
export function listWords(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What the API said went wrong, or our own words when it said nothing. */
export function errorMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

/** "2.4 MB" — the size as an admin would say it, or nothing if unrecorded. */
export function fileSizeLabel(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
