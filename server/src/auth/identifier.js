/**
 * What a student or assessor types to sign in: their ID number or their email.
 *
 * Anything with an "@" is an email; everything else is an ID number. Deciding
 * up front means one field is searched per collection, rather than an $or that
 * could match two different accounts.
 *
 * Anything but a plain string or number reads as empty. The value goes straight
 * into a MongoDB filter, and a body sending `{ "$ne": "" }` would otherwise
 * match the first account in the collection.
 */
export function readIdentifier(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
}

/** ID numbers are stored in capitals ("ASS001", "202300001"). */
export function readIdNumber(value) {
  return readIdentifier(value).toUpperCase();
}

/**
 * The filter value that finds a stored ID number, whatever case was typed.
 *
 * Capitals are what the console writes. The typed and lower-case spellings
 * cover a row written before that rule, by hand or by a seeder.
 */
export function idNumberMatch(value) {
  const typed = readIdentifier(value);
  return { $in: [...new Set([typed.toUpperCase(), typed, typed.toLowerCase()])] };
}

/**
 * The filter that finds whoever an identifier belongs to, in a collection whose
 * ID number is kept in `idField`.
 *
 * The console stores emails in lower case; the typed spelling covers an older
 * row that was not.
 */
export function loginFilter(value, idField) {
  const typed = readIdentifier(value);

  if (typed.includes("@")) {
    return { email: { $in: [...new Set([typed.toLowerCase(), typed])] } };
  }

  return { [idField]: idNumberMatch(typed) };
}
