import { useLayoutEffect, useState } from "react";

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
 *
 * The container is taken as a callback ref rather than a plain ref so it is
 * real reactive state: callers often mount it only after their own async data
 * arrives — the gen-toggle mounts after a course fetch, when the `deps` the
 * caller keyed this to may have already settled. State re-measures the moment
 * the container appears, so a pill is never stuck at zero size until the user
 * interacts.
 */
export function useGlidingPill(activeSelector, deps = []) {
  const [container, setContainer] = useState(null);
  const [pillStyle, setPillStyle] = useState({});

  useLayoutEffect(() => {
    const active = container?.querySelector(activeSelector);
    if (!container || !active) return;
    setPillStyle({
      left: `${active.offsetLeft}px`,
      top: `${active.offsetTop}px`,
      width: `${active.offsetWidth}px`,
      height: `${active.offsetHeight}px`
    });
  }, [container, ...deps]);

  return { pillRef: setContainer, pillStyle };
}