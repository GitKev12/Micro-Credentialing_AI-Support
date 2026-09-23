import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { DRAWER_QUERY, useMediaQuery } from "./useMediaQuery";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The behaviour behind the menu button on a phone, shared by all three Ends.
 *
 * Each End already has its panel: the rail on the Admin and Assessor Ends, the
 * account menu on the Student End. Below md that same panel is moved off the
 * page to the right by its stylesheet and slid back in when this says it is
 * open — so there is one set of links, not a desktop copy and a phone copy
 * that can drift apart. This hook owns only what the stylesheet cannot:
 *
 * - it is a modal while open: focus goes into it, Tab stays inside it, Escape
 *   shuts it, the page behind stops scrolling;
 * - choosing a destination shuts it, since the panel has done its job;
 * - widening the window past md shuts it, or a drawer left "open" when the
 *   rail comes back would leave the page locked;
 * - on close, focus returns to the button that opened it.
 *
 * Spread `triggerProps` on the menu button and `panelProps` on the panel. The
 * panel only takes dialog semantics while it is a drawer; as a desktop rail it
 * is ordinary page furniture and says nothing extra.
 */
export function useDrawer(label = "Menu") {
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();
  const { pathname } = useLocation();

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isDrawer) setOpen(false);
  }, [isDrawer]);

  useEffect(() => {
    if (!open) return undefined;

    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const focusables = () => (panel ? [...panel.querySelectorAll(FOCUSABLE)] : []);
    // One frame's wait: the panel is visibility:hidden until the open class
    // has been painted, and a hidden element cannot take focus.
    const frame = window.requestAnimationFrame(() => focusables()[0]?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      body.style.overflow = previousOverflow;
      // Only reclaim focus that was still in the panel. If the drawer shut
      // because something else took focus, that is where it should stay.
      const active = document.activeElement;
      if (!active || active === body || panel?.contains(active)) trigger?.focus();
    };
  }, [open]);

  return {
    isDrawer,
    open,
    close,
    triggerProps: {
      ref: triggerRef,
      "aria-expanded": open,
      "aria-controls": panelId,
      onClick: toggle
    },
    panelProps: isDrawer
      ? {
          id: panelId,
          ref: panelRef,
          role: "dialog",
          "aria-modal": open ? "true" : undefined,
          "aria-label": label
        }
      : { id: panelId, ref: panelRef }
  };
}
