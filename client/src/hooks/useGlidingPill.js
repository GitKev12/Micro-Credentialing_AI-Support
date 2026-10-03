import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// A little longer than the pills' 0.32s glide in the stylesheets.
const GLIDE_MS = 350;

/** The active item's box inside the container, or null when there isn't one. */
function boxOf(container, activeSelector) {
  const active = container?.querySelector(activeSelector);
  if (!active) return null;

  return {
    left: `${active.offsetLeft}px`,
    top: `${active.offsetTop}px`,
    width: `${active.offsetWidth}px`,
    height: `${active.offsetHeight}px`
  };
}

/**
 * The shared "login toggle" gesture: a highlight that glides between the items
 * in a group rather than being painted in place.
 *
 * Takes the selector of the item that is currently active and a list of values
 * that, when they change, mean a different item may be active (a route, a
 * selected tab). The container this hook is bound to with `pillRef` must be
 * `position: relative` — it is the offsetParent that each item's
 * offsetLeft/offsetTop are measured against. Returns a `pillStyle` to spread
 * onto an absolutely-positioned indicator inside that container.
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
  // When the current glide to a new item ends.
  const glidingUntil = useRef(0);

  // Glide to the active item whenever the caller says it may have changed.
  useLayoutEffect(() => {
    const box = boxOf(container, activeSelector);
    if (!box) return;
    glidingUntil.current = performance.now() + GLIDE_MS;
    setPillStyle(box);
  }, [container, ...deps]);

  // The group changing size (a sidebar folding or unfolding, the window being
  // resized) moves the items on every frame, so the pill follows them at once,
  // with no glide. During a glide it only updates where the glide is heading.
  useEffect(() => {
    if (!container || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      const box = boxOf(container, activeSelector);
      if (!box) return;
      const gliding = performance.now() < glidingUntil.current;
      // flushSync puts the pill in place before this frame is drawn, not a
      // frame late.
      flushSync(() => setPillStyle(gliding ? box : { ...box, transition: "none" }));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, activeSelector]);

  return { pillRef: setContainer, pillStyle };
}
