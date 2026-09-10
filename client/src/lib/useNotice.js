import { useCallback, useEffect, useRef, useState } from "react";

/** How long a notice stays on screen before it starts leaving. */
export const NOTICE_MS = 3000;

/** How long it takes to fade, in and out. Kept in step with `.notice-toast`. */
export const NOTICE_FADE_MS = 200;

/**
 * The line that reports the last write, which takes itself away again.
 *
 * A `useState` in its place kept the last message on screen until another write
 * replaced it, so "Ana Cruz's details were updated." was still sitting over the
 * toolbar minutes later, describing something the admin had long finished. It
 * reads as the state of the screen rather than as the receipt for one action.
 *
 * Three seconds, then it goes — whatever it said. Failures used to stay until
 * something replaced them, on the reasoning that a save which did not land is
 * the one thing somebody still has to act on. They now expire like the rest,
 * because a notice that behaves differently depending on how it went is a
 * notice you cannot learn the behaviour of. What the failure was about is
 * still on screen: the form it was refused from stays open with the values in
 * it, and the switch it belonged to has already moved back.
 *
 * It leaves in two steps rather than one. Vanishing on the same tick that ends
 * its three seconds gives it nothing to fade out through, so the timer marks it
 * `leaving` first and the row is unmounted a fade later. Render it with
 * `noticeClass`, which turns that flag into the class the animation is on.
 *
 * Used exactly like the `useState` it replaces:
 *
 *     const [notice, setNotice] = useNotice();
 *     setNotice({ tone: "ok", text: `${saved.name}'s details were updated.` });
 */
export function useNotice(after = NOTICE_MS, fade = NOTICE_FADE_MS) {
  const [notice, setNotice] = useState(null);
  const timers = useRef([]);

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // A countdown outliving the screen would fire into a component that is gone.
  useEffect(() => stop, []);

  const show = useCallback(
    (next) => {
      // Cleared first, so a second notice restarts the three seconds rather
      // than inheriting what was left of the first one's.
      stop();
      setNotice(next);
      if (!next) return;

      timers.current.push(
        setTimeout(() => {
          // Patched rather than replaced, so a notice cleared by hand in the
          // meantime is not brought back by its own timer.
          setNotice((current) => (current ? { ...current, leaving: true } : null));
          timers.current.push(setTimeout(() => setNotice(null), fade));
        }, after)
      );
    },
    [after, fade]
  );

  return [notice, show];
}

/**
 * The classes one of these carries: whatever the screen calls it, plus the
 * shared fade.
 *
 * `notice-toast` is what makes a message a message and not part of the page —
 * it fades in, sizes itself to its words, and fades out. It is put on by hand
 * at each site rather than by the class name, because the same
 * `admin-notice--error` block is a three-second receipt over a list and a
 * standing explanation inside a form, and only the first should ever leave on
 * its own.
 */
export function noticeClass(notice, base) {
  return [base, "notice-toast", notice?.leaving ? "is-leaving" : ""].filter(Boolean).join(" ");
}
