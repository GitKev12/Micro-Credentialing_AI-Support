import { useRef } from "react";

/**
 * Stops an older reply from overwriting a newer one.
 *
 * Two clicks in quick succession start two requests, and nothing promises the
 * first one finishes first. Without a guard the slower reply lands last and
 * wins: open Ana then Ben quickly and the screen can end up showing Ben's
 * heading over Ana's data, which is worse than showing nothing, because it
 * looks correct.
 *
 * Take a token when a request starts, and check it before using the reply:
 *
 *     const token = detail.next();
 *     fetchStudent(id).then((student) => {
 *       if (!detail.isCurrent(token)) return;
 *       setSelected(student);
 *     });
 *
 * A discarded reply is simply dropped. The request that superseded it is
 * already on its way and will set the state itself.
 */
export function useLatestRequest() {
  const latest = useRef(0);

  return {
    /** Claims this request as the current one, and returns its token. */
    next: () => (latest.current += 1),
    /** Whether the reply for `token` is still the one being waited on. */
    isCurrent: (token) => token === latest.current
  };
}
