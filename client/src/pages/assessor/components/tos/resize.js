/**
 * Growing a box from the height it had to the height it wants.
 *
 * Switching paper replaces the blueprint with one of a different length, and
 * dropped in it changes the dialog's height between one frame and the next.
 * These grow it instead.
 *
 * Measured with offsetHeight, never getBoundingClientRect(). The console
 * renders at --app-zoom (styles.css), so a rect comes back already multiplied
 * by it, and writing that number into a `height` multiplies it a second time:
 * the frame animated to 97% of where it belonged, then snapped the missing 3%
 * when the animation let go of it. offsetHeight is in the pixels `height` is
 * written in. LearningModules.jsx corrects the same reading the same way.
 */

export const RESIZE_MS = 260;
export const RESIZE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** The height a box is at now, before it is replaced. */
export function heightOf(element) {
  return element ? element.offsetHeight : 0;
}

/**
 * Animates the element from `from` to the height it has right now. Returns the
 * animation so the caller can cancel it, or null when there was nothing to do.
 */
export function animateHeight(element, from) {
  if (
    !element ||
    !element.animate ||
    !from ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return null;
  }

  const to = element.offsetHeight;
  if (Math.abs(to - from) < 1) return null;

  return element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: RESIZE_MS,
    easing: RESIZE_EASING
  });
}

/**
 * The same, for a box whose new contents are taller than the box is while it
 * grows. Without this the overflow is simply painted outside the box, which
 * leaves the scrolling frame around it already holding the full height: its
 * scrollbar arrives at its final size on the first frame while the frame is
 * still opening. Held in, the frame's scroll height grows with the box and the
 * scrollbar grows with it.
 */
export function animateHeightClipped(element, from) {
  const animation = animateHeight(element, from);
  if (!animation) return null;

  element.style.overflow = "hidden";
  animation.onfinish = animation.oncancel = () => {
    element.style.overflow = "";
  };
  return animation;
}
