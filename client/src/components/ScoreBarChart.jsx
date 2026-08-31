import { useLayoutEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

/**
 * Every bar chart in the system, drawn by Recharts.
 *
 * Two screens show the same picture — one bar per topic, scored out of 100,
 * read against a pass mark — in two skins. Both come through here, so the
 * chart is configured in one place.
 *
 * Recharts draws SVG into the page rather than fetching an engine and painting
 * a canvas, which is why this file is short. Everything the plot needs, it has
 * outright: `radius={[4, 4, 0, 0]}` is the old `border-radius: 4px 4px 0 0`
 * verbatim, `<ReferenceLine>` spans the whole plot the way the CSS hairline
 * did, and `<Cell>` colours each bar on its own. Nothing patches the rendered
 * SVG afterwards, and rgba tokens go straight through — so the theme's
 * translucent colours need no flattening, and the charts draw with no route
 * out to the internet.
 *
 * Colour is still read from CSS: a caller names tokens — `--skill-weak` — and
 * they resolve against this component's own container, which sits inside the
 * themed subtree, and are re-read when the theme switch is thrown.
 */

/** A `--token` resolves against the container; anything else is a literal. */
function resolve(styles, value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  if (!value.startsWith("--")) return value;
  return styles.getPropertyValue(value).trim() || fallback;
}

/** Scores are the caller's business, but only 0–100 can be drawn. */
export function plotRows(bars) {
  return bars.map((bar) => {
    const raw = Number(bar.score);
    const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;

    return {
      label: bar.label ?? "",
      score,
      tooltip: bar.tooltip ?? `${bar.label ?? ""} ${Math.round(score)}%`
    };
  });
}

/** The hover chip, painted from the same tokens as the chart around it. */
export function BarTooltip({ active, payload, surface, ink, border }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: `1px solid ${border}`,
        background: surface,
        color: ink,
        fontSize: 12,
        lineHeight: 1.35,
        whiteSpace: "nowrap"
      }}
    >
      {payload[0].payload.tooltip}
    </div>
  );
}

export function ScoreBarChart({
  bars,
  target = null,
  height = 76,
  axes = true,
  // The CSS capped a column at 22px: past that a mark stops being a mark and
  // becomes a slab. Left unset, the bars share the width out between them, the
  // way the assessor plot's did.
  barWidth,
  radius = 4,
  lineColor = "--gray-300",
  lineOpacity = 1,
  textColor = "--text-muted",
  surfaceColor = "--surface",
  ariaLabel,
  className,
  onClick
}) {
  const hostRef = useRef(null);
  const [palette, setPalette] = useState(null);

  // Every dependency is a string, so the effect cannot chase its own setState
  // round a loop the way it would on the `bars` array itself.
  const colorKey = bars.map((bar) => bar.color ?? "").join("|");

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof getComputedStyle !== "function") return undefined;

    const read = () => {
      const styles = getComputedStyle(host);
      setPalette({
        bars: colorKey.split("|").map((token) => resolve(styles, token, "#0ca30c")),
        line: resolve(styles, lineColor, "#dadada"),
        text: resolve(styles, textColor, "#667085"),
        surface: resolve(styles, surfaceColor, "#ffffff")
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
  }, [colorKey, lineColor, textColor, surfaceColor]);

  const rows = plotRows(bars);

  // The CSS grew each bar in and stood still for anyone who had asked the OS
  // for less motion; Recharts animates by default, so the same question gets
  // asked here. Where there is no matchMedia to ask — a test renderer — the
  // bars are simply drawn at their full height straight away.
  const animate =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ height }}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {/* Nothing is drawn until the tokens are off the DOM: a frame of
          fallback colours is a frame of the wrong theme. */}
      {palette ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={
              axes
                ? { top: 8, right: 6, bottom: 0, left: 0 }
                : { top: 2, right: 0, bottom: 0, left: 0 }
            }
            barCategoryGap={barWidth ? "10%" : 2}
          >
            <XAxis
              dataKey="label"
              hide={!axes}
              tickLine={false}
              axisLine={false}
              tick={{ fill: palette.text, fontSize: 11 }}
            />
            <YAxis
              hide={!axes}
              domain={[0, 100]}
              // The only number worth printing is the one the bars are read
              // against — a full scale is furniture on a plot this small.
              ticks={target === null ? [] : [target]}
              tickFormatter={(value) => `${value}%`}
              tickLine={false}
              axisLine={false}
              width={34}
              tick={{ fill: palette.text, fontSize: 11 }}
            />

            {target === null ? null : (
              <ReferenceLine
                y={target}
                stroke={palette.line}
                strokeOpacity={lineOpacity}
                strokeWidth={1}
              />
            )}

            <Tooltip
              cursor={false}
              content={
                <BarTooltip surface={palette.surface} ink={palette.text} border={palette.line} />
              }
            />

            {/* Rounded at the data end, square where it meets the baseline. */}
            <Bar
              dataKey="score"
              barSize={barWidth}
              radius={[radius, radius, 0, 0]}
              isAnimationActive={animate}
            >
              {rows.map((row, index) => (
                <Cell key={`${row.label}:${index}`} fill={palette.bars[index]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export default ScoreBarChart;
