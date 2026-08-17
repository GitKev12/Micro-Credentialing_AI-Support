import { useEffect } from "react";

/**
 * The badge a quiz just earned, announced in the corner of the screen.
 *
 * It shows for five seconds and takes itself away — a congratulation, not a
 * dialog, so nothing here waits for the student to dismiss it and nothing it
 * covers is anything they need. The badge wall is where the badge actually
 * lives; this only says it happened, at the moment it happened.
 *
 * Artwork is drawn the same way the wall draws it: a data: URI as an image, an
 * older emoji glyph as text, and a medal when the catalog carries neither.
 */

const SHOW_FOR_MS = 5000;

function BadgeToast({ badge, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOW_FOR_MS);
    return () => clearTimeout(timer);
    // Re-armed per badge: earning a second one restarts the five seconds rather
    // than inheriting what was left of the first.
  }, [badge, onDone]);

  const isImage = badge.icon && (badge.iconType === "svg" || badge.icon.startsWith("data:"));

  return (
    // Polite, so it is read after whatever the student is doing rather than
    // interrupting it — the same courtesy the five-second life implies.
    <div className="sd-badge-toast" role="status" aria-live="polite">
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
