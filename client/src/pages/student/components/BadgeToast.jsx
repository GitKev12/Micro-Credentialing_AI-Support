import { useEffect, useState } from "react";
import { NOTICE_FADE_MS, NOTICE_MS } from "../../../lib/useNotice";

/**
 * The badge a quiz just earned, announced in the corner of the screen.
 *
 * It shows for three seconds and takes itself away — a congratulation, not a
 * dialog, so nothing here waits for the student to dismiss it and nothing it
 * covers is anything they need. The badge wall is where the badge actually
 * lives; this only says it happened, at the moment it happened.
 *
 * Three seconds off the same constant every other console's message uses, so
 * one message does not outlive another for no reason a reader could name. It
 * leaves in two steps like they do: marked on its way out, then unmounted a
 * fade later, because a toast that vanishes on the tick its time is up has
 * nothing to fade out through.
 *
 * Artwork is drawn the same way the wall draws it: a data: URI as an image, an
 * older emoji glyph as text, and a medal when the catalog carries neither.
 */

function BadgeToast({ badge, onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setLeaving(false);
    const fading = setTimeout(() => setLeaving(true), NOTICE_MS);
    const gone = setTimeout(onDone, NOTICE_MS + NOTICE_FADE_MS);

    return () => {
      clearTimeout(fading);
      clearTimeout(gone);
    };
    // Re-armed per badge: earning a second one restarts the three seconds
    // rather than inheriting what was left of the first.
  }, [badge, onDone]);

  const isImage = badge.icon && (badge.iconType === "svg" || badge.icon.startsWith("data:"));

  return (
    // Polite, so it is read after whatever the student is doing rather than
    // interrupting it — the same courtesy the short life implies.
    <div
      className={`sd-badge-toast${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="sd-badge-toast__glyph" aria-hidden="true">
        {isImage ? (
          <img className="sd-badge-toast__art" src={badge.icon} alt="" />
        ) : (
          badge.icon || "🏅"
        )}
      </span>

      <p className="sd-badge-toast__text">
        You Earned <strong>{badge.name}</strong>!
      </p>
    </div>
  );
}

export default BadgeToast;
