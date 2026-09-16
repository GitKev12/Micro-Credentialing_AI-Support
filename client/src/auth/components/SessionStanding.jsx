import { useEffect, useRef } from "react";
import api, { withAuthToken } from "../../services/api";
import { fetchStanding, getStoredSession } from "../services/authService";
import { clearAuthSession } from "../services/session";
import { clearStanding, currentStanding, reportAccountSuspension, reportCourseStanding } from "../services/standing";
import { useAccountSuspension } from "../../lib/useStanding";

/**
 * The one thing on screen that is not about the course being read.
 *
 * Two jobs, and they are here together because they are the same job seen from
 * either end: keeping what the app believes about the person signed in level
 * with what the server believes, while they sit there and do nothing.
 *
 * It listens. A suspension is written in another console, and nothing about
 * the page a student is looking at can know that. So this holds a standing
 * stream open (GET /auth/standing/stream) and the server pushes down whatever
 * changes the moment it is written, rather than this asking again on a timer.
 * A suspended account still has one more way to find out — the account gate
 * sits in front of every other request too, so a refusal from *any* of them
 * is the answer just as well (see services/api.js).
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

/** The roles an administrator can suspend. Nobody can suspend an admin. */
const WATCHED_ROLES = ["student", "assessor"];

export default function SessionStanding() {
  const session = getStoredSession();
  const role = session?.user?.role ?? "";
  const watched = WATCHED_ROLES.includes(role);

  const suspension = useAccountSuspension();

  useEffect(() => {
    if (!watched) return undefined;

    let active = true;

    // Seeds the courses this student was already shut out of, and catches an
    // account already suspended before this tab opened — the stream only
    // reports what changes *after* it connects, and the interceptor behind
    // this request reports a 423 the same way any other request's would.
    fetchStanding()
      .then((courses) => {
        if (active) reportCourseStanding(courses);
      })
      .catch(() => {});

    const source = new EventSource(withAuthToken(`${api.defaults.baseURL}/auth/standing/stream`));

    source.onmessage = (event) => {
      if (!active) return;

      let state;
      try {
        state = JSON.parse(event.data);
      } catch {
        return;
      }

      reportCourseStanding(state.courses);
      if (state.account) {
        // Nothing left to hear — the server has already ended its side.
        reportAccountSuspension(state.account);
        source.close();
      }
    };

    // A dropped connection reconnects on its own — that resilience is the
    // point. The one case that must not retry is a suspended account: the
    // handshake itself is refused for one of those, forever, and retrying it
    // would just keep hammering the server for an answer this tab already has.
    source.onerror = () => {
      if (currentStanding().account) source.close();
    };

    return () => {
      active = false;
      source.close();
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
