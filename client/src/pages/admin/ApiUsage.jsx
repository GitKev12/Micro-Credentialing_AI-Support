import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApiUsage } from "../../services/admin";
import { PageHeader } from "./components/ui";
import { CAP, PLOT, VIEW, cappedColumn, layoutColumns, tickY } from "./components/chartGeometry";

/**
 * What the AI has cost.
 *
 * Everything on this page is read from the server's own spend log. Opening it,
 * and the five-second refresh, make no call to OpenAI and consume no tokens —
 * a monitor you have to think twice about refreshing is not a monitor.
 *
 * The chart is two series (tokens sent, tokens written back) stacked per day.
 * Colours come from --usage-input / --usage-output in admin.css, which are
 * validated for colour-blind separation in both themes; identity is carried by
 * the legend and the tooltip as well as the hue, never by hue alone.
 */

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" }
];

const REFRESH_MS = 5000;

/* ───────────────────────────── formatting ───────────────────────────── */

function compact(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 10_000) return `${(number / 1000).toFixed(number >= 100_000 ? 0 : 1)}K`;
  return number.toLocaleString();
}

const exact = (value) => (Number(value) || 0).toLocaleString();

function shortDay(iso) {
  const [, month, day] = String(iso).split("-");
  return `${Number(month)}/${Number(day)}`;
}

function agoLabel(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/* ───────────────────────────── the chart ───────────────────────────── */

function UsageChart({ daily, hovered, onHover }) {
  const { columns, ticks, top } = layoutColumns(daily);

  return (
    <svg
      className="usage-chart__svg"
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      role="img"
      aria-label={`Tokens used per day over the last ${daily.length} days`}
      onMouseLeave={() => onHover(null)}
    >
      {ticks.map((tick) => {
        const y = tickY(tick, top);
        return (
          <g key={tick}>
            <line
              x1={VIEW.left}
              x2={VIEW.left + PLOT.width}
              y1={y}
              y2={y}
              className={tick === 0 ? "usage-chart__baseline" : "usage-chart__grid"}
            />
            <text x={VIEW.left - 8} y={y + 3.5} className="usage-chart__tick" textAnchor="end">
              {compact(tick)}
            </text>
          </g>
        );
      })}

      {columns.map((column) => (
        <g
          key={column.day.date}
          onMouseEnter={() => onHover(column.index)}
          className={`usage-chart__band${hovered === column.index ? " is-hovered" : ""}`}
        >
          {/* A full-height target, so hovering works above a short column too. */}
          <rect
            x={column.bandLeft}
            y={VIEW.top}
            width={column.band}
            height={PLOT.height}
            className="usage-chart__hit"
          />

          {column.outputHeight > 0 ? (
            <path
              d={cappedColumn({
                x: column.x,
                y: column.outputY,
                width: column.barWidth,
                height: column.outputHeight,
                cap: column.outputCap
              })}
              className="usage-chart__output"
            />
          ) : null}

          {column.inputHeight > 0 ? (
            <path
              d={cappedColumn({
                x: column.x,
                y: column.inputY,
                width: column.barWidth,
                height: column.inputHeight,
                cap: CAP
              })}
              className="usage-chart__input"
            />
          ) : null}

          {column.isPeak ? (
            <text
              x={column.x + column.barWidth / 2}
              y={column.inputY - 6}
              className="usage-chart__value"
              textAnchor="middle"
            >
              {compact(column.day.totalTokens)}
            </text>
          ) : null}

          {column.showDate ? (
            <text
              x={column.x + column.barWidth / 2}
              y={VIEW.top + PLOT.height + 16}
              className="usage-chart__tick"
              textAnchor="middle"
            >
              {shortDay(column.day.date)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/* ───────────────────────────── tiles ───────────────────────────── */

function Tile({ label, value, sub, tone = "" }) {
  return (
    <div className={`usage-tile${tone ? ` usage-tile--${tone}` : ""}`}>
      <span className="usage-tile__label">{label}</span>
      <span className="usage-tile__value">{value}</span>
      {sub ? <span className="usage-tile__sub">{sub}</span> : null}
    </div>
  );
}

/* ───────────────────────────── the page ───────────────────────────── */

function ApiUsage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [live, setLive] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [, forceTick] = useState(0);
  const alive = useRef(true);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setStatus("loading");
      try {
        const next = await fetchApiUsage(days);
        if (!alive.current) return;
        setData(next);
        setStatus("ready");
      } catch (_error) {
        if (alive.current && !quiet) setStatus("error");
      }
    },
    [days]
  );

  useEffect(() => {
    alive.current = true;
    // A hover index from the old window would point at a different day, or at
    // no day at all, once the range changes under it.
    setHovered(null);
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  // Keeps the "updated 12s ago" line honest between refreshes.
  useEffect(() => {
    const timer = setInterval(() => forceTick((value) => value + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const daily = data?.daily ?? [];
  const totals = data?.totals ?? { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, byOutcome: {} };
  const hoveredDay = hovered != null ? daily[hovered] : null;

  const outcomeSummary = useMemo(() => {
    const byOutcome = totals.byOutcome ?? {};
    return Object.entries(byOutcome)
      .map(([name, count]) => `${count} ${name}`)
      .join(" · ");
  }, [totals.byOutcome]);

  if (status === "loading" && !data) {
    return (
      <>
        <PageHeader title="API Usage" subtitle="Token spend for assessment generation." />
        <div className="admin-state-card">Loading usage…</div>
      </>
    );
  }

  if (status === "error" && !data) {
    return (
      <>
        <PageHeader title="API Usage" subtitle="Token spend for assessment generation." />
        <div className="admin-state-card admin-state-card--error">
          Couldn&apos;t reach the API. Check that the server is running.
        </div>
      </>
    );
  }

  const nothingYet = totals.calls === 0;

  return (
    <>
      <PageHeader
        title="API Usage"
        subtitle={`Model ${data.model} · read from this server's own log, so refreshing costs nothing.`}
        action={
          <div className="usage-controls">
            <div className="usage-range" role="group" aria-label="Time range">
              {RANGES.map((range) => (
                <button
                  key={range.days}
                  type="button"
                  className={`usage-range__btn${days === range.days ? " is-active" : ""}`}
                  onClick={() => setDays(range.days)}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`usage-live${live ? " is-on" : ""}`}
              onClick={() => setLive((value) => !value)}
              aria-pressed={live}
              title={live ? "Pause auto-refresh" : "Resume auto-refresh"}
            >
              <span className="usage-live__dot" aria-hidden="true" />
              {live ? "Live" : "Paused"}
            </button>
          </div>
        }
      />

      <p className="usage-updated">
        Updated {agoLabel(data.generatedAt)}
        {live ? ` · refreshing every ${REFRESH_MS / 1000}s` : ""}
      </p>

      <section className="usage-hero">
        <div className="usage-hero__figure">
          <span className="usage-hero__label">Total tokens used</span>
          <span className="usage-hero__value">{exact(totals.totalTokens)}</span>
          <span className="usage-hero__sub">
            {totals.calls} generation {totals.calls === 1 ? "call" : "calls"}
            {outcomeSummary ? ` · ${outcomeSummary}` : ""}
          </span>
        </div>

        <div className="usage-tiles">
          <Tile label="Sent to the model" value={compact(totals.inputTokens)} sub={`${exact(totals.inputTokens)} tokens`} />
          <Tile label="Written back" value={compact(totals.outputTokens)} sub={`${exact(totals.outputTokens)} tokens`} />
          <Tile
            label="Questions stored"
            value={exact(data.corpus.questionsStored)}
            sub={`${data.corpus.lessonsWithQuiz} of ${data.corpus.lessons} lessons · ${data.corpus.finals} final${data.corpus.finals === 1 ? "" : "s"}`}
          />
        </div>
      </section>

      <section className="usage-chart admin-card">
        <div className="usage-chart__head">
          <div>
            <h2 className="usage-chart__title">Tokens per day</h2>
            <p className="usage-chart__sub">Last {data.windowDays} days</p>
          </div>

          <div className="usage-chart__right">
            <ul className="usage-legend">
              <li>
                <span className="usage-legend__key usage-legend__key--input" aria-hidden="true" />
                Sent
              </li>
              <li>
                <span className="usage-legend__key usage-legend__key--output" aria-hidden="true" />
                Written back
              </li>
            </ul>
            <button
              type="button"
              className="usage-tablebtn"
              onClick={() => setShowTable((value) => !value)}
              aria-pressed={showTable}
            >
              {showTable ? "Show chart" : "Show table"}
            </button>
          </div>
        </div>

        {nothingYet ? (
          <p className="usage-empty">
            No generation calls yet. Once a quiz is generated this fills in — tokens sent and
            written back, per day, with the running cost above.
          </p>
        ) : showTable ? (
          <div className="admin-table-card usage-inner-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="is-right">Calls</th>
                  <th className="is-right">Sent</th>
                  <th className="is-right">Written back</th>
                  <th className="is-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {daily
                  .filter((day) => day.calls > 0)
                  .map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td className="is-right">{day.calls}</td>
                      <td className="is-right">{exact(day.inputTokens)}</td>
                      <td className="is-right">{exact(day.outputTokens)}</td>
                      <td className="is-right">{exact(day.totalTokens)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="usage-chart__plot">
            <UsageChart daily={daily} hovered={hovered} onHover={setHovered} />

            {hoveredDay ? (
              <div
                className="usage-tooltip"
                style={{ left: `${((hovered + 0.5) / daily.length) * 100}%` }}
                role="status"
              >
                <p className="usage-tooltip__date">{hoveredDay.date}</p>
                <p className="usage-tooltip__row">
                  <span className="usage-legend__key usage-legend__key--input" aria-hidden="true" />
                  Sent<b>{exact(hoveredDay.inputTokens)}</b>
                </p>
                <p className="usage-tooltip__row">
                  <span className="usage-legend__key usage-legend__key--output" aria-hidden="true" />
                  Written back<b>{exact(hoveredDay.outputTokens)}</b>
                </p>
                <p className="usage-tooltip__total">
                  {hoveredDay.calls} {hoveredDay.calls === 1 ? "call" : "calls"} ·{" "}
                  {exact(hoveredDay.totalTokens)} tokens
                </p>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <div className="usage-split">
        <section className="admin-card usage-panel">
          <h2 className="usage-chart__title">Account balance</h2>
          {data.credits.available ? (
            <>
              <p className="usage-panel__figure">
                {data.credits.currency === "usd" ? "$" : ""}
                {Number(data.credits.spendToDate).toFixed(2)}
              </p>
              <p className="usage-panel__note">
                Spent this month, from OpenAI. This is spend, not remaining credit — the API does
                not expose a prepaid balance.
              </p>
            </>
          ) : (
            <>
              <p className="usage-panel__figure usage-panel__figure--muted">Not available</p>
              <p className="usage-panel__note">{data.credits.reason}</p>
            </>
          )}

          {data.projection ? (
            <p className="usage-panel__note usage-panel__note--divided">
              Finishing the remaining {data.projection.remainingCalls} lesson
              {data.projection.remainingCalls === 1 ? "" : "s"} would take roughly{" "}
              <b>{compact(data.projection.estimatedTokens)}</b> more tokens, going by the{" "}
              {compact(data.projection.averageTokensPerCall)} average so far.
            </p>
          ) : null}
        </section>

        <section className="admin-card usage-panel">
          <h2 className="usage-chart__title">By course</h2>
          {data.byCourse.length === 0 ? (
            <p className="usage-panel__note">Nothing generated yet.</p>
          ) : (
            <table className="admin-table usage-mini-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th className="is-right">Calls</th>
                  <th className="is-right">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.byCourse.map((row) => (
                  <tr key={row.courseCode}>
                    <td>{row.courseCode}</td>
                    <td className="is-right">{row.calls}</td>
                    <td className="is-right">{exact(row.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Course</th>
              <th>Lesson</th>
              <th>Result</th>
              <th className="is-right">Sent</th>
              <th className="is-right">Written back</th>
              <th className="is-right">Questions</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.length === 0 ? (
              <tr>
                <td colSpan={7} className="usage-panel__note">
                  No calls recorded in this window.
                </td>
              </tr>
            ) : (
              data.recent.map((row, index) => (
                <tr key={`${row.at}-${index}`}>
                  <td>{new Date(row.at).toLocaleString()}</td>
                  <td>{row.courseCode ?? "—"}</td>
                  <td>{row.moduleTitle ?? "—"}</td>
                  <td>
                    <span className={`usage-outcome usage-outcome--${row.outcome}`}>
                      {row.outcome}
                    </span>
                    {row.error ? <span className="usage-outcome__why">{row.error}</span> : null}
                  </td>
                  <td className="is-right">{exact(row.inputTokens)}</td>
                  <td className="is-right">{exact(row.outputTokens)}</td>
                  <td className="is-right">
                    {row.itemsUsable == null ? "—" : `${row.itemsUsable}/${row.itemsRequested ?? "?"}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

export default ApiUsage;
