import { useRef } from "react";

const PARALLAX_SHIFT = 18;
const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * The campus photo with the white card on top, shared by sign in, sign up and
 * forgot password. The photo drifts a little against the mouse.
 */
function AuthScreen({ cardClassName = "", children }) {
  const backgroundRef = useRef(null);

  const moveBackground = (offsetX, offsetY) => {
    const background = backgroundRef.current;
    if (!background) return;
    background.style.transform = `scale(1.12) translate3d(${offsetX}px, ${offsetY}px, 0)`;
  };

  const handlePointerMove = (event) => {
    if (prefersReducedMotion()) return;
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    moveBackground(-x * PARALLAX_SHIFT, -y * PARALLAX_SHIFT);
  };

  return (
    <section
      className="login-screen"
      onMouseMove={handlePointerMove}
      onMouseLeave={() => moveBackground(0, 0)}
    >
      <div className="login-screen__bg" ref={backgroundRef} aria-hidden="true" />
      <article className={`login-card ${cardClassName}`.trim()}>{children}</article>
    </section>
  );
}

export default AuthScreen;
