import { useLayoutEffect, useRef, useState } from "react";
import { Chart } from "react-google-charts";

/**
 * Every bar chart in the system, drawn by Google Charts.
 *
 * Two screens show the same picture — one bar per topic, scored out of 100,
 * read against a pass mark — in two skins. Both come through here, so the
 * chart engine is configured in one place.
 *
 * It is a ComboChart rather than a plain ColumnChart because the pass mark has
 * to be drawn and Google Charts has no threshold primitive: the mark rides
 * along as a second series pinned to the same value at every bar, which draws
 * the hairline these screens used to lay out in CSS.
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

export function ScoreBarChart({
  bars,
  target = null,
  height = 76,
  axes = true,
  lineColor = "--gray-300",
  textColor = "--text-muted",
  gridColor = "transparent",
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
      setPalette({
        bars: colorKey.split("|").map((token) => resolve(styles, token, "#0ca30c")),
        line: resolve(styles, lineColor, "#dadada"),
        text: resolve(styles, textColor, "#667085"),
        grid: resolve(styles, gridColor, "transparent")
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
  }, [colorKey, lineColor, textColor, gridColor]);

  const header = ["Topic", "Score", { role: "style" }, { role: "tooltip" }];
  if (target !== null) header.push("Pass mark");

  const data = [
    header,
    ...bars.map((bar, index) => {
      const score = Math.max(0, Math.min(100, Number(bar.score) || 0));
      const row = [
        bar.label ?? "",
        score,
        palette ? palette.bars[index] : "transparent",
        bar.tooltip ?? `${bar.label ?? ""} ${Math.round(score)}%`
      ];
      if (target !== null) row.push(target);
      return row;
    })
  ];

  const rule = palette ? palette.line : "#dadada";
  const ink = palette ? palette.text : "#667085";
  const grid = palette ? palette.grid : "transparent";

  const options = {
    legend: "none",
    backgroundColor: "transparent",
    // Room for the axis only where there is an axis to make room for.
    chartArea: axes
      ? { left: 34, right: 10, top: 10, bottom: 22 }
      : { left: 0, right: 0, top: 2, bottom: 0, width: "100%", height: "98%" },
    bar: { groupWidth: "88%" },
    seriesType: "bars",
    // Series 1 is the pass mark: a reference, not data, so it takes no hover
    // of its own and carries no point markers.
    series:
      target === null
        ? {}
        : {
            1: {
              type: "line",
              color: rule,
              lineWidth: 1,
              pointSize: 0,
              enableInteractivity: false
            }
          },
    vAxis: {
      viewWindow: { min: 0, max: 100 },
      textPosition: axes ? "out" : "none",
      gridlines: { color: grid, count: axes ? 3 : 0 },
      minorGridlines: { count: 0 },
      baselineColor: axes ? grid : "transparent",
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
        chartType="ComboChart"
        width="100%"
        height={`${height}px`}
        data={data}
        options={options}
        // The engine is fetched from Google at runtime. Until it lands — or if
        // it never does, on a machine with no route out — the space stays
        // blank rather than holding a spinner that outlives the chart.
        loader={<span aria-hidden="true" />}
      />
    </div>
  );
}

export default ScoreBarChart;
