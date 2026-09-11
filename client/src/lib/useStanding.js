import { useEffect, useState } from "react";
import { currentStanding, watchStanding } from "../auth/services/standing";

/**
 * Reading the standing store from a screen.
 *
 * The store is plain so the axios layer can write to it (see
 * auth/services/standing.js); these are the hooks that let a page follow it.
 */

/** The whole of it: `{ account, courses, known }`. */
export function useStanding() {
  const [standing, setStanding] = useState(currentStanding);

  useEffect(() => {
    // Read again on the way in. The first refusal can land between the render
    // that seeded the state and the effect that starts listening.
    setStanding(currentStanding());
    return watchStanding(setStanding);
  }, []);

  return standing;
}

/** The suspension shutting the whole account, or null while there is none. */
export function useAccountSuspension() {
  return useStanding().account;
}

/**
 * Where one course stands, in three answers rather than two:
 *
 *   undefined — nothing heard yet. The screen keeps what it loaded with.
 *   null      — heard, and this course is open.
 *   object    — heard, and it is closed, with the reason and who closed it.
 *
 * The middle state is the point. A course that was shut when the page loaded
 * must stay shut on screen until the server says otherwise, and an empty store
 * is not the server saying otherwise.
 */
export function useCourseSuspension(courseId) {
  const { courses, known } = useStanding();
  if (!known || !courseId) return undefined;
  return courses[String(courseId)] ?? null;
}

/**
 * A course as it stands now, rather than as it was served.
 *
 * The card was drawn from a list fetched minutes ago; this lays the live answer
 * over it, in the fields the card already reads, so nothing downstream needs to
 * know where the newer fact came from.
 */
export function applySuspension(course, suspension) {
  if (!suspension) {
    if (!course.suspended) return course;
    return { ...course, suspended: false, suspendedReason: null, suspendedBy: null };
  }

  if (course.suspended && course.suspendedReason === suspension.reason) return course;

  return {
    ...course,
    suspended: true,
    suspendedReason: suspension.reason,
    suspendedBy: suspension.by
  };
}
