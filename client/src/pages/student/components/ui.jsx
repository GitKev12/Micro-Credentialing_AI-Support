import { useEffect, useState } from "react";
import { TARGET, toScore } from "../performance";
import { BandIcon } from "./icons";

/**
 * Shared marks and figures for the student area.
 *
 * Everything that draws a value lives here so a score is rendered the same
 * way in every place it appears — the dashboard cards, the focus list, the
 * course detail — and so the mark specs (thin bars, a rounded data end, a
 * same-ramp track, a recessive target hairline) are written once.
 */

/** True one frame after mount — lets bars grow from zero instead of popping. */
export function useGrown() {
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return grown;
}

/**
 * A single ratio against a limit: the fill carries severity, the track is
 * the same hue tinted back toward the surface, and the passing mark rides
 * along as a hairline so "how far off am I" is readable without arithmetic.
 */
export function Meter({ value, band, label, small = false, showTarget = true }) {
  const grown = useGrown();
  const score = toScore(value);

  return (
    <div
      className={`sd-meter${small ? " sd-meter--sm" : ""}`}
      data-band={band.id}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="sd-meter__fill" style={{ width: `${grown ? score : 0}%` }} />
      {showTarget ? (
        <span className="sd-meter__target" style={{ left: `${TARGET}%` }} aria-hidden="true" />
      ) : null}
    </div>
  );
}

/** Caption naming the hairline, so the target line is never unexplained. */
export function TargetLegend() {
  return (
    <span className="sd-meter-legend">
      <span className="sd-meter-legend__tick" aria-hidden="true" />
      Passing mark {TARGET}%
    </span>
  );
}

/**
 * Band identity as icon + word + tint. The status palette is only safe when
 * colour is the third channel rather than the only one, so this component is
 * the single approved way to show a band.
 */
export function BandChip({ band, size = 13 }) {
  return (
    <span className="sd-band-chip" data-band={band.id}>
      <BandIcon band={band.id} size={size} />
      {band.label}
    </span>
  );
}

/** Value + unit, split so the "%" stays quiet next to the number. */
export function Score({ value, className }) {
  return (
    <span className={className}>
      {toScore(value)}
      <small>%</small>
    </span>
  );
}

export function StatTile({ icon, label, value, unit, note }) {
  return (
    <li className="sd-tile">
      <span className="sd-tile__label">
        {icon}
        {label}
      </span>
      <p className="sd-tile__value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </p>
      {note ? <p className="sd-tile__note">{note}</p> : null}
    </li>
  );
}

export function EmptyState({ image, title, children }) {
  return (
    <div className="sd-empty">
      {image ? <img className="sd-empty__img" src={image} alt="" aria-hidden="true" /> : null}
      <p className="sd-empty__title">{title}</p>
      <p className="sd-empty__text">{children}</p>
    </div>
  );
}
