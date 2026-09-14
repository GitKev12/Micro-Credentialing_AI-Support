import { useLayoutEffect, useRef, useState } from "react";

/**
 * The shared "login toggle" gesture: a highlight that glides between the items
 * in a group rather than being painted in place.
 *
 * Takes the selector of the item that is currently active and a list of values
 * that, when they change, mean the active item's box may have moved (a route, a
 * selected tab, a collapsed state). The container this hook is bound to with
 * `pillRef` must be `position: relative` — it is the offsetParent that each
 * item's offsetLeft/offsetTop are measured against. Returns a `pillStyle` to
 * spread onto an absolutely-positioned indicator inside that container.
 *
 * Reading the active box during layout (not after paint) is what keeps the pill
 * from ever flashing in the wrong place.
 */
export function useGlidingPill(activeSelector, deps = []) {
  const pillRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({});

  useLayoutEffect(() => {
    const container = pillRef.current;
    const active = container?.querySelector(activeSelector);
    if (!container || !active) return;
    setPillStyle({
      left: `${active.offsetLeft}px`,
      top: `${active.offsetTop}px`,
      width: `${active.offsetWidth}px`,
      height: `${active.offsetHeight}px`
    });
  }, deps);

  return { pillRef, pillStyle };
}