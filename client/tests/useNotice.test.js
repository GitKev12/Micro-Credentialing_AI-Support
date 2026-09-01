import { describe, it, expect, beforeAll, afterEach, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { renderHook, act } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let useNotice;
let NOTICE_MS;

beforeAll(async () => {
  ({ useNotice, NOTICE_MS } = await import("../src/lib/useNotice.js"));
});

afterEach(() => {
  jest.useRealTimers();
});

const ok = (text) => ({ tone: "ok", text });
const failed = (text) => ({ tone: "error", text });

describe("useNotice — the line that takes itself away", () => {
  it("drops a success once its three seconds are up", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](ok("Ana Cruz's details were updated.")));
    expect(result.current[0]).toEqual(ok("Ana Cruz's details were updated."));

    // A moment short of the deadline: still on screen.
    act(() => jest.advanceTimersByTime(NOTICE_MS - 1));
    expect(result.current[0]).not.toBeNull();

    act(() => jest.advanceTimersByTime(1));
    expect(result.current[0]).toBeNull();
  });

  // The half somebody still has to act on. A save that did not land must not
  // clear itself before it has been read.
  it("keeps a failure on screen", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](failed("Couldn't save this assessor.")));
    act(() => jest.advanceTimersByTime(NOTICE_MS * 4));

    expect(result.current[0]).toEqual(failed("Couldn't save this assessor."));
  });

  it("restarts the countdown for a second success rather than inheriting the first one's", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => result.current[1](ok("first")));
    act(() => jest.advanceTimersByTime(NOTICE_MS - 100));
    act(() => result.current[1](ok("second")));

    // Where the first notice's timer would have fired.
    act(() => jest.advanceTimersByTime(200));
    expect(result.current[0]).toEqual(ok("second"));

    act(() => jest.advanceTimersByTime(NOTICE_MS));
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
