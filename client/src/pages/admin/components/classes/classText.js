
/**
 * The sections a class may be, and the list the form offers.
 *
 * A section is one of a short fixed set, so it is picked rather than typed.
 * Typed, the same room arrived as "Sec A", "section a" and "CC2-A" — three
 * spellings of one thing, which sort as three and read as three.
 *
 * It is optional. A course taught to a single cohort has no sections to tell
 * apart, and making that class invent a name is ceremony. The empty option is
 * how it is left unset — offered in the list rather than left as a placeholder,
 * so having no section reads as an answer instead of an unfilled field.
 * `classTitle` is what such a class is called wherever it is listed.
 */
export const SECTIONS = ["Section-A", "Section-B", "Section-C", "Section-D"];

export const sectionOptions = [
  { value: "", label: "No section" },
  ...SECTIONS.map((section) => ({ value: section, label: section }))
];

/**
 * What a class is called wherever it is listed rather than edited.
 *
 * The name is optional, so it is not always what the class is called. One
 * without a section falls back to its course code — which is what it is, and
 * what the column beside it says anyway — rather than rendering a blank cell
 * that reads as a row which failed to load.
 */
export function classTitle(cls) {
  const name = String(cls?.name ?? "").trim();
  if (name) return name;
  return cls?.course?.code || cls?.course?.title || "Unnamed class";
}

/** The schedule as one line — "MWF · 09:00–10:00 · Lab 201", or nothing. */
export function scheduleSummary(schedule) {
  const parts = [schedule?.days, schedule?.time, schedule?.room]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.join(" · ");
}

