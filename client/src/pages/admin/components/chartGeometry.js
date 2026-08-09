/**
 * The arithmetic behind the usage chart.
 *
 * Kept out of the component so it can be run and checked on its own — a bar
 * chart is mostly geometry, and geometry that is only exercised by rendering it
 * is geometry nobody has actually verified.
 */

// One fixed coordinate system, scaled to fit by the SVG viewBox. Keeps the
// component free of layout measurement.
export const VIEW = { width: 760, height: 240, top: 16, right: 12, bottom: 28, left: 52 };

export const PLOT = {
  width: VIEW.width - VIEW.left - VIEW.right,
  height: VIEW.height - VIEW.top - VIEW.bottom
};

export const MAX_BAR = 24;    // never fill the slot — the leftover band is air
export const SEGMENT_GAP = 2; // surface-coloured gap between stacked segments
export const CAP = 4;         // rounded data-end; the foot stays square

/** Clean axis numbers — 0 / 20,000 / 40,000, never 0 / 18,706 / 37,412. */
export function niceTicks(max) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };

  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rough) ??
    magnitude * 10;
  const top = Math.ceil(max / step) * step;

  // Deduped: a sub-1 step rounds several ticks onto the same integer, which
  // would stack gridlines on top of each other and hand React repeated keys.
  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    const rounded = Math.round(value);
    if (ticks[ticks.length - 1] !== rounded) ticks.push(rounded);
  }

  return { top, ticks };
}

/**
 * A column with a rounded top and a square foot.
 *
 * Drawn as a path rather than a rect with `rx`, because `rx` rounds all four
 * corners and lifts the bar visually off the baseline it is measured from.
 */
export function cappedColumn({ x, y, width, height, cap }) {
  if (!(height > 0) || !(width > 0)) return "";

  const radius = Math.max(0, Math.min(cap, width / 2, height));

  return [
    `M${x},${y + height}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + width - radius},${y}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `L${x + width},${y + height}`,
    "Z"
  ].join(" ");
}

/**
 * Where every column and label goes.
 *
 * `output` sits on the baseline and `input` stacks above it, separated by the
 * surface gap rather than by a stroke. Only the busiest day is value-labelled —
 * a number on every column is noise — and the date axis thins itself out so
 * labels never collide on a 90-day window.
 */
export function layoutColumns(daily) {
  const max = Math.max(0, ...daily.map((day) => day.totalTokens ?? 0));
  const { top, ticks } = niceTicks(max);

  const band = PLOT.width / Math.max(daily.length, 1);
  const barWidth = Math.min(MAX_BAR, band * 0.62);
  const scale = (value) => ((Number(value) || 0) / top) * PLOT.height;

  const peakIndex = daily.reduce(
    (best, day, index) => ((day.totalTokens ?? 0) > (daily[best]?.totalTokens ?? -1) ? index : best),
    0
  );
  const labelEvery = Math.max(1, Math.ceil(daily.length / 12));

  const columns = daily.map((day, index) => {
    const bandLeft = VIEW.left + index * band;
    const x = bandLeft + (band - barWidth) / 2;

    const inputHeight = scale(day.inputTokens);
    const outputHeight = scale(day.outputTokens);
    const stacked = outputHeight > 0 && inputHeight > 0;

    const outputY = VIEW.top + PLOT.height - outputHeight;
    const inputY = outputY - inputHeight - (stacked ? SEGMENT_GAP : 0);

    return {
      day,
      index,
      bandLeft,
      band,
      x,
      barWidth,
      inputHeight,
      outputHeight,
      inputY,
      outputY,
      // The lower segment keeps a square top when something stacks on it.
      outputCap: stacked ? 0 : CAP,
      isPeak: index === peakIndex && (day.totalTokens ?? 0) > 0,
      showDate: index % labelEvery === 0
    };
  });

  return { columns, ticks, top, scale, band, barWidth };
}

/** The y a gridline for `tick` sits on. */
export function tickY(tick, top) {
  return VIEW.top + PLOT.height - ((Number(tick) || 0) / top) * PLOT.height;
}
