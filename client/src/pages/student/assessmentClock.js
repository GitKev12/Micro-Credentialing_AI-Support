/**
 * How long a paper runs, and how long is left of it.
 *
 * Two different jobs and two different readings. Before the paper is turned
 * over the length is a plan — "1 hour 30 minutes", the way you would say it
 * out loud when deciding whether you have time. Once it is running it is a
 * countdown, and a countdown is read at a glance under pressure, so it is
 * digits: 29:04. Saying "twenty-nine minutes" to someone with twenty-nine
 * minutes left is making them do arithmetic they do not have time for.
 */

/** "45 minutes", "1 hour", "1 hour 30 minutes". */
export function durationLabel(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return "";

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts = [];

  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);

  return parts.join(" ");
}

/** The short form for a rail row, where there is no space for words: "90 min". */
export const shortDuration = (minutes) =>
  Number(minutes) > 0 ? `${Math.round(Number(minutes))} min` : "";

/**
 * Milliseconds left as a clock face.
 *
 * Zero-padded minutes only once there are hours to sit in front of them: a
 * paper with nine minutes left reads 9:04, not 09:04, which is how a clock is
 * read everywhere else.
 */
export function clockFace(msLeft) {
  const left = Math.max(0, Math.ceil((Number(msLeft) || 0) / 1000));
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const pad = (value) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * What a screen reader is told, which is not what the digits say.
 *
 * "29:04" is read out as "twenty-nine oh four", which is a time of day. The
 * announcement is also the only form a student who cannot see the strip gets,
 * so it names the unit.
 */
export function spokenTimeLeft(msLeft) {
  const left = Math.max(0, Math.ceil((Number(msLeft) || 0) / 1000));
  if (left === 0) return "Time is up";

  const minutes = Math.floor(left / 60);
  const seconds = left % 60;

  if (minutes === 0) return `${seconds} second${seconds === 1 ? "" : "s"} left`;
  if (minutes < 5) return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  return `${minutes} minutes left`;
}

/** Under five minutes, which is when the strip stops being background. */
export const LOW_TIME_MS = 5 * 60 * 1000;
