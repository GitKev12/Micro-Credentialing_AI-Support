import { useEffect, useState } from "react";

/**
 * The md breakpoint from styles.css, as the one place script reads it.
 *
 * At and below this width the side rail on the Admin and Assessor Ends, and the
 * account menu on the Student End, stop being part of the page and become a
 * drawer that opens from the right behind a menu button. The stylesheets make
 * the same switch at the same literal; if one moves, both have to.
 */
export const DRAWER_QUERY = "(max-width: 52rem)";

/**
 * Whether a media query currently matches, kept live as the window changes.
 *
 * Reads as false where the environment has no matchMedia — jsdom has none — so
 * a component under test draws its desktop form rather than failing to draw.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => readQuery(query));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function readQuery(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}
