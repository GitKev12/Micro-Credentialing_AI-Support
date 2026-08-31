import { useLayoutEffect, useRef, useState } from "react";
import { Chart } from "react-google-charts";

/**
 * Every bar chart in the system, drawn by Google Charts.
 *
 * Two screens show the same picture — one bar per topic, scored out of 100,
 * read against a pass mark — in two skins. Both come through here, so the
 * chart engine is configured in one place.
 *
 * The pass mark is a lone gridline, not a series. Google Charts has no
 * threshold primitive, and a line series only runs from the first bar's centre
 * to the last one's — it stopped short of both edges, where the hand-drawn
 * hairline spanned the whole plot. Pinning a single tick at the threshold and
 * letting its gridline draw gets the full width back.
 *
 * Colour is the one thing the library takes away. The bars used to paint from
 * CSS tokens and follow the theme for nothing; Google Charts wants literal
 * strings in JS. So a caller still names tokens — `--skill-weak` — and they
 * are resolved against this component's own container, which sits inside the
 * themed subtree. What comes back is already correct for the active theme, and
 * the observer re-reads it when the switch is thrown.
 */

/** A `--token` resolves against the container; anything else is a literal. */
function resolve(styles, value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  if (!value.startsWith("--")) return value;
  return styles.getPropertyValue(value).trim() || fallback;
}

/** #abc, #aabbcc, rgb() and rgba() → [r, g, b, a]. Anything else is a keyword,
 *  which the engine knows how to read on its own. */
export function parseColor(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) {
    return [1, 2, 3].map((i) => parseInt(short[i] + short[i], 16)).concat(1);
  }

  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (long) {
    return [1, 2, 3].map((i) => parseInt(long[i], 16)).concat(1);
  }

  const fn = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    }
  }

  return null;
}

/**
 * Flatten a colour onto the surface it will be drawn against.
 *
 * Google Charts parses every colour itself and rejects `rgba()` outright — it
 * throws "Invalid color: rgba(255, 255, 255, 0.30)", which is precisely what
 * the dark theme's hairline token is: translucent white over a dark card. CSS
 * composited that for free. Here it has to be done by hand, and the result is
 * the colour the browser would have painted anyway.
 */
export function opaque(color, surface, fade = 1) {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const [r, g, b, own] = parsed;
  const alpha = own * fade;
  const round = (value) => Math.max(0, Math.min(255, Math.round(value)));
  if (alpha >= 1) return `rgb(${round(r)}, ${round(g)}, ${round(b)})`;

  const base = parseColor(surface) ?? [255, 255, 255, 1];
  const mix = (over, under) => round(over * alpha + under * (1 - alpha));
  return `rgb(${mix(r, base[0])}, ${mix(g, base[1])}, ${mix(b, base[2])})`;
}

export function ScoreBarChart({
  bars,
  target = null,
  height = 76,
  axes = true,
  // The hand-drawn columns capped at 22px: past that a mark stops being a mark
  // and becomes a slab. Google Charts sizes bars by the group, so the cap is
  // expressed there — a number is pixels, a string is a share of the slot.
  barWidth = "88%",
  radius = 4,
  lineColor = "--gray-300",
  // The card's hairline was the muted token at 45% — it has to sit a step off
  // the surface so it never competes with the data it is measuring.
  lineOpacity = 1,
  textColor = "--text-muted",
  surfaceColor = "--surface",
  ariaLabel,
  className,
  onClick
}) {
  const hostRef = useRef(null);
  const [palette, setPalette] = useState(null);

  // Every dependency below is a string, so the effect cannot chase its own
  // setState round a loop the way it would on the `bars` array itself.
  const colorKey = bars.map((bar) => bar.color ?? "").join("|");

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof getComputedStyle !== "function") return undefined;

    const read = () => {
      const styles = getComputedStyle(host);
      // The surface is read first: it is what anything translucent has to be
      // flattened onto before the engine will accept it.
      const surface = resolve(styles, surfaceColor, "#ffffff");

      setPalette({
        bars: colorKey.split("|").map((token) => opaque(resolve(styles, token, "#0ca30c"), surface)),
        line: opaque(resolve(styles, lineColor, "#dadada"), surface, lineOpacity),
        text: opaque(resolve(styles, textColor, "#667085"), surface)
      });
    };

    read();

    // The theme switch only flips an attribute on <html>; the tokens under it
    // change with it, so the chart has to be told to look again.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    return () => observer.disconnect();
  }, [colorKey, lineColor, lineOpacity, textColor, surfaceColor]);

  // Nothing reaches the engine until the palette is off the DOM. Google Charts
  // parses every colour it is handed and throws "Invalid color" on anything
  // that is not one — which is what a first render would pass, before the
  // tokens have been read. The effect above resolves them before paint, so
  // this frame is never seen; it exists to give that effect its element.
  if (!palette) {
    return (
      <div
        ref={hostRef}
        className={className}
        style={{ height }}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
      />
    );
  }

  const data = [
    ["Topic", "Score", { role: "style" }, { role: "tooltip" }],
    ...bars.map((bar, index) => {
      const score = Math.max(0, Math.min(100, Number(bar.score) || 0));
      return [
        bar.label ?? "",
        score,
        palette.bars[index],
        bar.tooltip ?? `${bar.label ?? ""} ${Math.round(score)}%`
      ];
    })
  ];

  /**
   * Round the top of every bar, the way `border-radius: 4px 4px 0 0` did —
   * rounded at the data end, square where it meets the baseline.
   *
   * Google Charts has no corner option, so the drawn bars are patched on the
   * way out. An `rx` on the rect would round the feet too, so instead a capped
   * path is laid underneath and the rect is turned invisible: the rect stays
   * in the DOM, which is what the engine hit-tests for hover, and on the course
   * card hover is the only thing that names a topic. Runs on every `ready`,
   * which the engine fires after each redraw — hence clearing its own caps
   * first, so redraws do not stack them up.
   */
  const roundBarTops = () => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg || !radius) return;

    svg.querySelectorAll("path[data-bar-cap]").forEach((cap) => cap.remove());

    // Match on the colour we asked for, channel by channel — the engine is
    // free to hand back a hex where we passed an rgb().
    const ours = palette.bars.map(parseColor).filter(Boolean);

    svg.querySelectorAll("rect").forEach((rect) => {
      const fill = parseColor(rect.getAttribute("fill"));
      if (!fill) return;
      if (!ours.some((c) => c[0] === fill[0] && c[1] === fill[1] && c[2] === fill[2])) return;

      const x = Number(rect.getAttribute("x"));
      const y = Number(rect.getAttribute("y"));
      const w = Number(rect.getAttribute("width"));
      const h = Number(rect.getAttribute("height"));
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;

      const r = Math.min(radius, w / 2, h);
      const cap = document.createElementNS("http://www.w3.org/2000/svg", "path");
      cap.setAttribute(
        "d",
        `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}` +
          `H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`
      );
      cap.setAttribute("fill", rect.getAttribute("fill"));
      cap.setAttribute("data-bar-cap", "");

      rect.setAttribute("fill-opacity", "0");
      rect.parentNode.insertBefore(cap, rect);
    });
  };

  const rule = palette.line;
  const ink = palette.text;

  const options = {
    legend: "none",
    backgroundColor: "transparent",
    // Room for the axis only where there is an axis to make room for.
    chartArea: axes
      ? { left: 34, right: 10, top: 10, bottom: 22 }
      : { left: 0, right: 0, top: 2, bottom: 0, width: "100%", height: "98%" },
    bar: { groupWidth: barWidth },
    vAxis: {
      viewWindow: { min: 0, max: 100 },
      textPosition: axes ? "out" : "none",
      // One tick, at the pass mark, so its gridline is the hairline — full
      // width of the plot, and behind the bars, exactly where CSS put it.
      ticks: target === null ? [] : [{ v: target, f: `${target}%` }],
      gridlines: { color: target === null ? "transparent" : rule },
      minorGridlines: { count: 0 },
      baselineColor: "transparent",
      textStyle: { color: ink, fontSize: 11 }
    },
    hAxis: {
      textPosition: axes ? "out" : "none",
      gridlines: { count: 0 },
      baselineColor: "transparent",
      textStyle: { color: ink, fontSize: 11 }
    },
    tooltip: { textStyle: { fontSize: 12 } }
  };

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ height }}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <Chart
        chartType="ColumnChart"
        width="100%"
        height={`${height}px`}
        data={data}
        options={options}
        chartEvents={[{ eventName: "ready", callback: roundBarTops }]}
        // The engine is fetched from Google at runtime. Until it lands — or if
        // it never does, on a machine with no route out — the space stays
        // blank rather than holding a spinner that outlives the chart.
        loader={<span aria-hidden="true" />}
      />
    </div>
  );
}

export default ScoreBarChart;
