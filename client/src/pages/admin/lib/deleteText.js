import { plural } from "./format";

/*
 * The lines in each delete dialog: what goes, and what stays.
 * `impact` is null while it loads, and `{ unknown: true }` if the count failed.
 */

export function courseLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) {
    return [
      "its lessons, with their files and quizzes",
      "any class set up on it, with its schedule and roster",
      "any completions and submissions recorded in it",
      "its Table of Specification blueprint"
    ];
  }

  return [
    impact.modules ? `${plural(impact.modules, "lesson")}, with their files and quizzes` : "",
    impact.classes ? `${plural(impact.classes, "class", "es")}, with their schedules and rosters` : "",
    impact.completions ? plural(impact.completions, "lesson completion") : "",
    impact.submissions ? plural(impact.submissions, "quiz submission") : "",
    impact.blueprints ? "its Table of Specification blueprint" : ""
  ].filter(Boolean);
}

export function courseKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.enrolled ? `${plural(impact.enrolled, "student")} — unenrolled, but their account and records stay` : "",
    impact.assessors ? `${plural(impact.assessors, "assessor")} — unassigned, but their account stays` : ""
  ].filter(Boolean);
}

export function studentLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) {
    return [
      "their quiz submissions and the marks on them",
      "their lesson completions",
      "any certificate they have been issued"
    ];
  }

  return [
    impact.submissions ? plural(impact.submissions, "quiz submission") : "",
    impact.completions ? plural(impact.completions, "lesson completion") : "",
    impact.certificates ? plural(impact.certificates, "issued certificate") : ""
  ].filter(Boolean);
}

export function studentKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.classes ? `${plural(impact.classes, "class", "es")} — the class stays, its roster is one shorter` : "",
    impact.enrolled ? `${plural(impact.enrolled, "course")} — the course and its lessons are untouched` : ""
  ].filter(Boolean);
}

export function assessorLosses(impact) {
  if (!impact) return null;
  if (impact.unknown) return ["their sign-in, and their place on any class they staff"];

  return [
    "their sign-in",
    impact.classes ? `their place on ${plural(impact.classes, "class", "es")} — the class stays, one assessor short` : ""
  ].filter(Boolean);
}

export function assessorKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.graded ? `${plural(impact.graded, "released grade")} — the mark stands, and the student keeps it` : "",
    impact.assigned ? `${plural(impact.assigned, "course")} — its lessons and posted papers are untouched` : ""
  ].filter(Boolean);
}

export function classLosses(impact) {
  if (!impact) return null;
  return ["this class, its roster and schedule"];
}

export function classKeeps(impact) {
  if (!impact || impact.unknown) return [];

  return [
    impact.unenroll ? `${plural(impact.unenroll, "student")} — unenrolled from the course, account and records stay` : "",
    impact.unassign ? `${plural(impact.unassign, "assessor")} — unassigned from the course, account stays` : ""
  ].filter(Boolean);
}
