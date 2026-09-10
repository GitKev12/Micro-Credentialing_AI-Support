import { describe, it, expect } from "@jest/globals";
import { readSuspendedFlag } from "../src/lib/suspension.js";

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
