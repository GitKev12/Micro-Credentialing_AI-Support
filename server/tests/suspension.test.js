import { describe, it, expect } from "@jest/globals";
import { accountSuspensionFrom, readSuspendedFlag, refuseSuspendedAccount } from "../src/lib/suspension.js";

// Set before the guard is exercised: tokens.js reads it when it signs, not
// when it is imported, and refuses to work without one.
process.env.AUTH_SECRET = "test-secret-that-is-long-enough-to-be-accepted-here";

const { signAuthToken } = await import("../src/auth/tokens.js");
const { requireAuth } = await import("../src/middleware/auth.js");

/**
 * Reading a suspension request.
 *
 * Two consoles write this flag now — the admin's Students screen and the
 * assessor's roster — and both ask this function what the body meant, so the
 * one thing worth pinning is that a *missing* field is not read as "let them
 * back in". A PATCH that says nothing about suspension must change nothing,
 * and `false` is falsy, so a caller testing truthiness rather than null would
 * quietly reactivate every account it touched.
 */
describe("readSuspendedFlag", () => {
  it("reads a request to suspend", () => {
    expect(readSuspendedFlag({ suspended: true })).toBe(true);
  });

  it("reads a request to let them back in", () => {
    expect(readSuspendedFlag({ suspended: false })).toBe(false);
  });

  it("answers null when the body says nothing about it", () => {
    // Not false. The caller refuses the request rather than acting on it.
    expect(readSuspendedFlag({})).toBeNull();
    expect(readSuspendedFlag({ name: "Ana Cruz" })).toBeNull();
    expect(readSuspendedFlag(null)).toBeNull();
    expect(readSuspendedFlag(undefined)).toBeNull();
  });

  it("only true is true, so a stray string cannot lock somebody out", () => {
    expect(readSuspendedFlag({ suspended: "yes" })).toBe(false);
    expect(readSuspendedFlag({ suspended: 1 })).toBe(false);
  });

  it("tells 'said false' apart from 'said nothing'", () => {
    // The whole point of the null: these are different requests.
    expect(readSuspendedFlag({ suspended: false })).not.toBeNull();
  });
});

/**
 * Suspending an account used to mean one thing only: no new sign-in. The token
 * already in a browser was signed, unexpired and never questioned again, so a
 * student suspended at ten past nine went on reading lessons and handing in
 * papers for the rest of the day. These are the rule that closed that.
 */
describe("accountSuspensionFrom", () => {
  it("locks an account whose own row says so", () => {
    const suspension = accountSuspensionFrom({ suspended: true });

    expect(suspension).not.toBeNull();
    expect(suspension.scope).toBe("account");
  });

  it("leaves an account in good standing alone", () => {
    expect(accountSuspensionFrom({ suspended: false })).toBeNull();
    // A row written before the field existed. Nothing to say is not a lock.
    expect(accountSuspensionFrom({})).toBeNull();
    expect(accountSuspensionFrom(null)).toBeNull();
  });

  /**
   * The flag is the whole of what stands between somebody and their own
   * coursework, so it is read exactly. A truthy string locking an account out
   * would be a lock nobody meant to turn.
   */
  it("locks on true and on nothing else", () => {
    expect(accountSuspensionFrom({ suspended: "yes" })).toBeNull();
    expect(accountSuspensionFrom({ suspended: 1 })).toBeNull();
  });

  /**
   * Two suspensions reach a student, and they are undone by different people.
   * This one is the administrator's, and the sentence has to send them there —
   * and say their work is still there, because an account that has gone quiet
   * reads as one that has been deleted.
   */
  it("names who can lift it, and says nothing has been lost", () => {
    const { by, reason } = accountSuspensionFrom({ suspended: true });

    expect(by).toBe("admin");
    expect(reason).toMatch(/administrator/i);
    expect(reason).toMatch(/deleted/i);
  });
});

function fakeResponse() {
  const sent = { status: 0, body: null };
  return {
    sent,
    status(code) {
      sent.status = code;
      return this;
    },
    json(body) {
      sent.body = body;
      return this;
    }
  };
}

describe("refuseSuspendedAccount", () => {
  it("answers 423 with the reason, and says which suspension it is", () => {
    const response = fakeResponse();
    refuseSuspendedAccount(response, accountSuspensionFrom({ suspended: true }));

    // 423 rather than 401: a dead token sends the client to the login form,
    // and the student would be looking at a form instead of at the reason.
    expect(response.sent.status).toBe(423);
    expect(response.sent.body.locked).toBe(true);
    expect(response.sent.body.suspended).toBe(true);
    // What tells this apart from a course being closed — the client shows the
    // two in different places.
    expect(response.sent.body.scope).toBe("account");
    expect(response.sent.body.by).toBe("admin");
    expect(response.sent.body.message).toMatch(/administrator/i);
  });
});

/**
 * The guard every route in this API is reached through.
 *
 * The account read itself needs a database and is exercised above; what is
 * worth pinning here is that adding it did not change the two answers the
 * guard already gave — and, in particular, that a database nobody can reach
 * does not read as a suspension. Turning a dropped connection into "your
 * account has been suspended" would be a false and alarming thing to tell
 * somebody.
 */
describe("requireAuth", () => {
  const asRequest = (token) => ({
    get: (header) => (header.toLowerCase() === "authorization" ? `Bearer ${token}` : ""),
    query: {}
  });

  it("turns away a caller with no token", async () => {
    const response = fakeResponse();
    let went = false;

    await requireAuth({ get: () => "", query: {} }, response, () => {
      went = true;
    });

    expect(went).toBe(false);
    expect(response.sent.status).toBe(401);
  });

  it("lets a signed caller through while the database is unreachable", async () => {
    const token = signAuthToken({ _id: "6c3f8fabafe387a98b837201" }, "student");
    const request = asRequest(token);
    const response = fakeResponse();
    let went = false;

    await requireAuth(request, response, () => {
      went = true;
    });

    expect(went).toBe(true);
    expect(response.sent.status).toBe(0);
    expect(request.session).toEqual({ id: "6c3f8fabafe387a98b837201", role: "student" });
  });
});
