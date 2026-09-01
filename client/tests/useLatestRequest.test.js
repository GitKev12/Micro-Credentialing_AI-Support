import { describe, it, expect, beforeAll } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import { renderHook, act } from "@testing-library/react";

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

let useLatestRequest;

beforeAll(async () => {
  ({ useLatestRequest } = await import("../src/lib/useLatestRequest.js"));
});

describe("useLatestRequest — the reply that arrives too late", () => {
  it("keeps the newest request current", () => {
    const { result } = renderHook(() => useLatestRequest());

    const first = result.current.next();
    expect(result.current.isCurrent(first)).toBe(true);

    const second = result.current.next();
    expect(result.current.isCurrent(second)).toBe(true);
    // The slow reply for the first click, landing after the second: dropped.
    expect(result.current.isCurrent(first)).toBe(false);
  });

  it("hands out a different token every time", () => {
    const { result } = renderHook(() => useLatestRequest());

    const tokens = [result.current.next(), result.current.next(), result.current.next()];

    expect(new Set(tokens).size).toBe(3);
  });

  it("survives a re-render, so a token taken before one is still judged after", () => {
    const { result, rerender } = renderHook(() => useLatestRequest());

    const token = result.current.next();
    rerender();

    expect(result.current.isCurrent(token)).toBe(true);
  });

  // Two guards on one screen must not cancel each other — the module confirm
  // and the course confirm can both be open at once.
  it("counts independently from another guard", () => {
    const a = renderHook(() => useLatestRequest());
    const b = renderHook(() => useLatestRequest());

    const tokenA = a.result.current.next();
    b.result.current.next();
    b.result.current.next();

    expect(a.result.current.isCurrent(tokenA)).toBe(true);
  });
});
