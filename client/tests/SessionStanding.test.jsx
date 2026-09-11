import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";
import { act, render, screen, fireEvent } from "@testing-library/react";

/**
 * Being told, while sitting still.
 *
 * A suspension is written in another console. Nothing about the screen the
 * student is looking at knows it has happened, and until this watcher existed
 * nothing told them: they carried on until something made the page reload.
 *
 * Two halves, and both are here because they are the same job from either end.
 * It asks the server every few seconds what is closed — which is also how a
 * suspended account finds out, since that request is refused like every other
 * (the axios layer reports the refusal; see services/api.js). And when the
 * answer is that the account itself is shut, it says so over the top of
 * whatever console they were in, because that is not one page's news.
 */

let user = { id: "stu-1", role: "student" };
let answer = { courses: [] };
let asked = 0;
let refuse = false;

const clearAuthSession = jest.fn();

jest.unstable_mockModule("../src/auth/services/authService.js", () => ({
  getStoredSession: () => ({ token: "t0ken", user }),
  fetchStanding: async () => {
    asked += 1;
    if (refuse) throw new Error("refused");
    return answer.courses;
  }
}));

jest.unstable_mockModule("../src/auth/services/session.js", () => ({
  clearAuthSession,
  getAuthToken: () => "t0ken"
}));

let SessionStanding, reportAccountSuspension, clearStanding, currentStanding;

// jsdom cannot navigate, and signing out asks it to. Stubbed so the test can
// read where it was sent rather than jsdom's complaint about being asked.
const assign = jest.fn();

beforeAll(async () => {
  delete window.location;
  window.location = { pathname: "/student", assign };

  ({ default: SessionStanding } = await import("../src/auth/components/SessionStanding.jsx"));
  ({ reportAccountSuspension, clearStanding, currentStanding } = await import(
    "../src/auth/services/standing.js"
  ));
});

beforeEach(() => {
  user = { id: "stu-1", role: "student" };
  answer = { courses: [] };
  asked = 0;
  refuse = false;
  clearAuthSession.mockClear();
  assign.mockClear();
  clearStanding();
});

const draw = async () => {
  const view = render(<SessionStanding />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
};

const suspend = async (message = "Your account has been suspended by the administrator.") => {
  await act(async () => {
    reportAccountSuspension({ message, scope: "account", by: "admin" });
  });
};

describe("watching where the session stands", () => {
  it("asks as soon as it is on screen, rather than at the first tick", async () => {
    await draw();
    expect(asked).toBe(1);
  });

  it("publishes what came back, so the screens reading it follow", async () => {
    answer = { courses: [{ courseId: "c1", by: "assessor", reason: "Shut for you." }] };
    await draw();

    expect(currentStanding().known).toBe(true);
    expect(currentStanding().courses.c1).toEqual({ reason: "Shut for you.", by: "assessor" });
  });

  /**
   * A dropped request says nothing about where anybody stands. Reading it as
   * "nothing is closed" would reopen, on screen, a course the student has
   * already been told is shut.
   */
  it("says nothing at all when the request fails", async () => {
    refuse = true;
    await draw();

    expect(currentStanding().known).toBe(false);
  });

  // Nobody can suspend an administrator, so there is nothing to watch for.
  it("leaves the admin console alone", async () => {
    user = { id: "adm-1", role: "admin" };
    await draw();

    expect(asked).toBe(0);
  });

  // The assessor console is watched too: an account suspension is the admin's,
  // and it reaches assessors as well as students.
  it("watches an assessor as closely as a student", async () => {
    user = { id: "asr-1", role: "assessor" };
    await draw();

    expect(asked).toBe(1);
  });
});

describe("an account that has been suspended", () => {
  it("stays out of the way until there is something to say", async () => {
    await draw();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("takes the screen, in the words the server sent", async () => {
    await draw();
    await suspend("Your account has been suspended by the administrator. Nothing has been deleted.");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your account has been suspended by the administrator. Nothing has been deleted."
      )
    ).toBeInTheDocument();
  });

  /**
   * One way out, and it is not a dismissal: everything behind this dialog is
   * refused now, so a way back to it would be a way back to a screen that
   * answers every press with this same sentence.
   */
  it("offers signing out, and nothing else", async () => {
    await draw();
    await suspend();

    const dialog = screen.getByRole("alertdialog");
    const buttons = dialog.querySelectorAll("button");

    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Back to sign in");
    // Focus is moved to it: the screen behind is gone and the keyboard should
    // not still be somewhere in it.
    expect(document.activeElement).toBe(buttons[0]);
  });

  /**
   * The session is dropped on the way out rather than the moment the refusal
   * lands. Clearing it at once would have bounced them to the login form —
   * a screen with no explanation on it — so they would have been shut out
   * without ever being told why.
   */
  it("keeps the session until they leave", async () => {
    await draw();
    await suspend();
    expect(clearAuthSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(clearAuthSession).toHaveBeenCalled();
    // A whole reload rather than a route change: every screen behind the
    // dialog is holding data belonging to a session that is over.
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("stops asking once it knows", async () => {
    await draw();
    await suspend();
    const before = asked;

    // Whatever the timer does next, there is nothing left to find out.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(asked).toBe(before);
  });
});
