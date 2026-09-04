import { describe, it, expect, beforeAll, afterEach, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { renderHook, act } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let useNotice;
let noticeClass;
let NOTICE_MS;
let NOTICE_FADE_MS;

beforeAll(async () => {
  ({ useNotice, noticeClass, NOTICE_MS, NOTICE_FADE_MS } = await import(
    "../src/lib/useNotice.js"
  ));
});

afterEach(() => {
  jest.useRealTimers();
});

const ok = (text) => ({ tone: "ok", text });
const failed = (text) => ({ tone: "error", text });

describe("useNotice — the line that takes itself away", () => {
  it("drops a success once its three seconds and its fade are up", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](ok("Ana Cruz's details were updated.")));
    expect(result.current[0]).toMatchObject(ok("Ana Cruz's details were updated."));

    // A moment short of the deadline: still on screen, and not yet leaving.
    act(() => jest.advanceTimersByTime(NOTICE_MS - 1));
    expect(result.current[0].leaving).toBeFalsy();

    // On the deadline it starts leaving — still mounted, so it has something
    // to fade out through.
    act(() => jest.advanceTimersByTime(1));
    expect(result.current[0].leaving).toBe(true);
    expect(result.current[0].text).toBe("Ana Cruz's details were updated.");

    act(() => jest.advanceTimersByTime(NOTICE_FADE_MS));
    expect(result.current[0]).toBeNull();
  });

  /**
   * Failures used to stay until something replaced them. They now go like the
   * rest: a message that behaves differently depending on how the write went
   * is one nobody can learn the behaviour of, and what the failure was about
   * is still on screen — the form stays open, the switch has moved back.
   */
  it("drops a failure on the same three seconds", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](failed("Couldn't save this assessor.")));
    act(() => jest.advanceTimersByTime(NOTICE_MS + NOTICE_FADE_MS));

    expect(result.current[0]).toBeNull();
  });

  it("restarts the countdown for a second success rather than inheriting the first one's", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](ok("first")));
    act(() => jest.advanceTimersByTime(NOTICE_MS - 100));
    act(() => result.current[1](ok("second")));

    // Where the first notice's timer would have fired.
    act(() => jest.advanceTimersByTime(200));
    expect(result.current[0]).toMatchObject(ok("second"));
    expect(result.current[0].leaving).toBeFalsy();

    act(() => jest.advanceTimersByTime(NOTICE_MS + NOTICE_FADE_MS));
    expect(result.current[0]).toBeNull();
  });

  /**
   * The second timer is armed inside the first, and only patches what is
   * already there — a screen that cleared the line by hand during the fade
   * must not have it put back.
   */
  it("does not resurrect a notice cleared while it was fading", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](ok("saved")));
    act(() => jest.advanceTimersByTime(NOTICE_MS));
    expect(result.current[0].leaving).toBe(true);

    act(() => result.current[1](null));
    act(() => jest.advanceTimersByTime(NOTICE_FADE_MS * 4));
    expect(result.current[0]).toBeNull();
  });

  // Opening a record clears the line by hand; the pending timer must not then
  // fire into a screen that has moved on.
  it("lets the caller clear it early", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](ok("saved")));
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();

    act(() => jest.advanceTimersByTime(NOTICE_MS * 2));
    expect(result.current[0]).toBeNull();
  });

  it("cancels the countdown when the screen goes", () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useNotice());

    act(() => result.current[1](ok("saved")));
    unmount();

    // Would warn about setting state on an unmounted component if it fired.
    expect(() => jest.advanceTimersByTime(NOTICE_MS * 2)).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });
});

/**
 * What each render site puts on the element. The shared class is added by hand
 * per site and not by the notice's own class name, because the same coloured
 * block is a three-second receipt over a list and a standing refusal inside a
 * form — only the first should ever leave on its own.
 */
describe("noticeClass", () => {
  it("adds the shared fade to whatever the screen calls its notice", () => {
    expect(noticeClass(ok("saved"), "assessor-notice assessor-notice--ok")).toBe(
      "assessor-notice assessor-notice--ok notice-toast"
    );
  });

  it("marks it on the way out, which is what the animation hangs off", () => {
    expect(noticeClass({ tone: "ok", text: "saved", leaving: true }, "gen-notice")).toBe(
      "gen-notice notice-toast is-leaving"
    );
  });

  it("survives being asked about nothing", () => {
    // Sites render the block only when there is a notice, but the helper is
    // called in the same expression and must not throw first.
    expect(noticeClass(null, "admin-notice")).toBe("admin-notice notice-toast");
  });
});
