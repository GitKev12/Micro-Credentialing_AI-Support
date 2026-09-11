import { useEffect, useRef } from "react";
import { fetchStanding, getStoredSession } from "../services/authService";
import { clearAuthSession } from "../services/session";
import { clearStanding, reportCourseStanding } from "../services/standing";
import { useAccountSuspension } from "../../lib/useStanding";

/**
 * The one thing on screen that is not about the course being read.
 *
 * Two jobs, and they are here together because they are the same job seen from
 * either end: keeping what the app believes about the person signed in level
 * with what the server believes, while they sit there and do nothing.
 *
 * It asks. A suspension is written in another console, and nothing about the
 * page a student is looking at can know that. So this asks the server every few
 * seconds what is closed — and because the account gate sits in front of that
 * request like every other, the asking is also how a suspended account finds
 * out: the refusal is the answer (see services/api.js).
 *
 * And it says so. A closed course shuts a page and is drawn by that page; a
 * closed account shuts everything, so it is drawn here, over whatever console
 * they were in.
 *
 * Mounted outside the app shell rather than in it, because the shell is
 * animated in and a transformed ancestor is the containing block for anything
 * fixed inside it — the dialog would size itself to the page rather than to the
 * window. See AppLayout.
 */

/**
 * Ten seconds, which is the longest a student who is doing nothing at all waits
 * to be told. Anybody actually working is told at once, by the first thing they
 * press — every request is refused, not only this one.
 *
 * Nothing is asked while the tab is in the background: a suspension nobody is
 * there to read is not urgent, and it is asked again the moment they come back.
 */
const ASK_EVERY_MS = 10000;

/** The roles an administrator can suspend. Nobody can suspend an admin. */
const WATCHED_ROLES = ["student", "assessor"];

export default function SessionStanding() {
  const session = getStoredSession();
  const role = session?.user?.role ?? "";
  const watched = WATCHED_ROLES.includes(role);

  const suspension = useAccountSuspension();

  // Held in a ref so a refusal landing mid-poll stops the timer without the
  // effect being torn down and rebuilt around a changing dependency.
  const stopped = useRef(false);
  stopped.current = Boolean(suspension);

  useEffect(() => {
    if (!watched) return undefined;

    let active = true;

    const ask = () => {
      if (!active || stopped.current) return;
      if (document.visibilityState === "hidden") return;

      fetchStanding()
        .then((courses) => {
          if (active) reportCourseStanding(courses);
        })
        // A dropped request says nothing about where anybody stands, so the
        // screen keeps what it has. The next ask is ten seconds away.
        .catch(() => {});
    };

    ask();
    const timer = window.setInterval(ask, ASK_EVERY_MS);
    document.addEventListener("visibilitychange", ask);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [watched, session?.token]);

  if (!suspension) return null;

  return <AccountSuspended message={suspension.message} />;
}

/**
 * The account is shut, said over the top of whatever they were doing.
 *
 * There is one button, and it is not a way out of the dialog: nothing behind it
 * works any more, so offering a way back to it would be offering a screen that
 * answers every press with this same sentence. Signing out is the only move
 * left, and the login screen will say the same thing if they try again.
 *
 * The session is dropped on the way out rather than the moment the refusal
 * lands. Clearing it here would have bounced them to the login form
 * immediately, which is a screen with no explanation on it — they would have
 * been shut out without ever being told why.
 */
function AccountSuspended({ message }) {
  const button = useRef(null);

  useEffect(() => {
    button.current?.focus();
  }, []);

  const signOut = () => {
    clearStanding();
    clearAuthSession();
    // A whole reload, not a route change: every screen behind this is holding
    // data belonging to a session that is over.
    window.location.assign("/login");
  };

  return (
    <div className="standing-lock" role="alertdialog" aria-modal="true" aria-labelledby="standing-lock-title">
      <div className="standing-lock__panel">
        <span className="standing-lock__icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </span>

        <h2 className="standing-lock__title" id="standing-lock-title">
          Your account is suspended
        </h2>

        <p className="standing-lock__text">{message}</p>

        <button type="button" className="standing-lock__btn" onClick={signOut} ref={button}>
          Back to sign in
        </button>
      </div>
    </div>
  );
}
