import { useCallback, useEffect, useRef, useState } from "react";

/** How long a success notice stays on screen. */
export const NOTICE_MS = 3000;

/**
 * The line that reports the last write, which takes itself away again.
 *
 * A `useState` in its place kept the last success on screen until another
 * write replaced it, so "Ana Cruz's details were updated." was still sitting
 * over the toolbar minutes later, describing something the admin had long
 * finished. It reads as the state of the screen rather than as the receipt for
 * one action.
 *
 * Only a success expires. A failure is the one thing on the line somebody
 * still has to act on — a save that did not land, a switch that did not move —
 * and taking it away after three seconds would let a write fail quietly. Those
 * stay until the next write replaces them.
 *
 * Used exactly like the `useState` it replaces:
 *
 *     const [notice, setNotice] = useNotice();
 *     setNotice({ tone: "ok", text: `${saved.name}'s details were updated.` });
 */
export function useNotice(after = NOTICE_MS) {
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);

  const stop = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  };

  // A countdown outliving the screen would fire into a component that is gone.
  useEffect(() => stop, []);

  const show = useCallback(
    (next) => {
      // Cleared first, so a second success restarts the three seconds rather
      // than inheriting what was left of the first one's.
      stop();
      setNotice(next);

      if (next?.tone !== "ok") return;
      timer.current = setTimeout(() => {
        timer.current = null;
        setNotice(null);
      }, after);
    },
    [after]
  );

  return [notice, show];
}
