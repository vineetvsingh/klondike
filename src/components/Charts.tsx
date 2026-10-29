import { useState, type PointerEvent, type ReactNode } from 'react';
import { variantLabel } from '../game/engine';
import type { GameRecord } from '../game/profile';
import { formatTime } from './format';

// Inline-SVG charts for the stats page. One series each, so no legend box: the
// heading names what is plotted. Every value is also in the table under the chart.

const W = 400;
const PAD = { l: 34, r: 12, t: 14, b: 24 };

function ChartFrame({ title, sub, children, table }: { title: string; sub: string; children: ReactNode; table: ReactNode }) {
  return (
    <figure className="chart">
      <figcaption>
        <b>{title}</b>
        <span>{sub}</span>
      </figcaption>
      {children}
      <details className="chart-table">
        <summary>View as table</summary>
        {table}
      </details>
    </figure>
  );
}

function Tip({ x, y, value, label }: { x: number; y: number; value: ReactNode; label: ReactNode }) {
  return (
    <div className="chart-tip" style={{ left: `${(x / W) * 100}%`, top: y }}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

const modeLabel = (r: GameRecord) =>
  r.v === 'klondike' ? `Klondike · Draw ${r.mode}` : r.v === 'spider' ? `Spider · ${r.mode} suit${r.mode > 1 ? 's' : ''}` : variantLabel(r.v);

const dateLabel = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// ---------- Win rate over time ----------

const WINDOW = 10;

export function WinRateChart({ records }: { records: GameRecord[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 150;
  const pts = records.map((_, i) => {
    const slice = records.slice(Math.max(0, i - WINDOW + 1), i + 1);
    return Math.round((slice.filter((r) => r.won).length / slice.length) * 100);
  });

  const body = (() => {
    if (records.length < 2) return <p className="chart-empty">Finish a couple of games to see your trend.</p>;
    const x = (i: number) => PAD.l + (i / (pts.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const last = pts.length - 1;
    const onMove = (e: PointerEvent<SVGRectElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * (W - PAD.l - PAD.r);
      setHover(Math.max(0, Math.min(last, Math.round((px / (W - PAD.l - PAD.r)) * last))));
    };
    return (
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Win rate over your last ${records.length} games, now ${pts[last]}%`}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
              <text className="tick" x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end">{v}%</text>
            </g>
          ))}
          <text className="tick" x={PAD.l} y={H - 6}>Game 1</text>
          <text className="tick" x={W - PAD.r} y={H - 6} textAnchor="end">Game {records.length}</text>
          <path className="area" d={area} />
          <path className="line" d={line} />
          {hover != null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} />}
          <circle className="dot" cx={x(hover ?? last)} cy={y(pts[hover ?? last])} r={4.5} />
          {hover == null && (
            <text className="end-label" x={x(last) - 8} y={y(pts[last]) - 9} textAnchor="end">{pts[last]}%</text>
          )}
          <rect
            className="hit"
            x={PAD.l}
            y={0}
            width={W - PAD.l - PAD.r}
            height={H}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover != null && (
          <Tip
            x={x(hover)}
            y={y(pts[hover]) - 10}
            value={`${pts[hover]}%`}
            label={`Game ${hover + 1} · ${records[hover].won ? 'won' : 'lost'} · ${modeLabel(records[hover])}`}
          />
        )}
      </div>
    );
  })();

  return (
    <ChartFrame
      title="Win rate over time"
      sub={`Share of wins in each run of ${WINDOW} games`}
      table={
        <table>
          <thead><tr><th>Game</th><th>Result</th><th>Win rate</th></tr></thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td>{r.won ? 'Won' : 'Lost'}</td><td>{pts[i]}%</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      {body}
    </ChartFrame>
  );
}

// ---------- Time histogram ----------

export function TimeHistogram({ records }: { records: GameRecord[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 140;
  const wins = records.filter((r) => r.won);
  const maxT = Math.max(60, ...wins.map((r) => r.time));
  const size = Math.max(1, Math.ceil(maxT / 60 / 8)) * 60; // at most ~8 buckets, whole minutes
  const n = Math.ceil((maxT + 1) / size);
  const buckets = Array.from({ length: n }, (_, i) => ({
    from: i * size,
    to: (i + 1) * size,
    count: wins.filter((r) => r.time >= i * size && r.time < (i + 1) * size).length,
  }));
  const top = Math.max(1, ...buckets.map((b) => b.count));
  const label = (b: { from: number; to: number }) => `${b.from / 60}–${b.to / 60} min`;

  const plotW = W - PAD.l - PAD.r;
  const band = plotW / n;
  const bw = Math.min(24, band - 2);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const tallest = buckets.findIndex((b) => b.count === top);

  return (
    <ChartFrame
      title="How long your wins take"
      sub="Wins grouped by finishing time"
      table={
        <table>
          <thead><tr><th>Time</th><th>Wins</th></tr></thead>
          <tbody>{buckets.map((b) => <tr key={b.from}><td>{label(b)}</td><td>{b.count}</td></tr>)}</tbody>
        </table>
      }
    >
      {!wins.length ? (
        <p className="chart-empty">Your winning times will show up here.</p>
      ) : (
        <div className="chart-plot">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histogram of winning times">
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
            <text className="tick" x={PAD.l - 6} y={y(top) + 3.5} textAnchor="end">{top}</text>
            <text className="tick" x={PAD.l - 6} y={y(0) + 3.5} textAnchor="end">0</text>
            {buckets.map((b, i) => {
              const cx = PAD.l + band * (i + 0.5);
              const h = y(0) - y(b.count);
              const r = Math.min(4, h);
              const x0 = cx - bw / 2;
              return (
                <g
                  key={b.from}
                  className={`col${hover === i ? ' on' : ''}`}
                  tabIndex={0}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  <rect className="hit" x={cx - band / 2} y={PAD.t} width={band} height={y(0) - PAD.t} />
                  {b.count > 0 && (
                    <path
                      className="bar"
                      d={`M${x0},${y(0)}V${y(b.count) + r}Q${x0},${y(b.count)} ${x0 + r},${y(b.count)}H${x0 + bw - r}Q${x0 + bw},${y(b.count)} ${x0 + bw},${y(b.count) + r}V${y(0)}Z`}
                    />
                  )}
                  {(i === 0 || i === n - 1 || n <= 6) && (
                    <text className="tick" x={cx} y={H - 6} textAnchor="middle">{b.from / 60}m</text>
                  )}
                  {i === tallest && hover == null && (
                    <text className="end-label" x={cx} y={y(b.count) - 6} textAnchor="middle">{b.count}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover != null && (
            <Tip
              x={PAD.l + band * (hover + 0.5)}
              y={y(buckets[hover].count) - 8}
              value={`${buckets[hover].count} win${buckets[hover].count === 1 ? '' : 's'}`}
              label={label(buckets[hover])}
            />
          )}
        </div>
      )}
    </ChartFrame>
  );
}

// ---------- Best runs ----------

export function BestRuns({ records }: { records: GameRecord[] }) {
  const best = records.filter((r) => r.won).sort((a, b) => a.time - b.time || a.moves - b.moves).slice(0, 5);
  const slowest = Math.max(1, ...best.map((r) => r.time));
  return (
    <ChartFrame
      title="Best runs"
      sub="Your five fastest wins"
      table={
        <table>
          <thead><tr><th>Game</th><th>Date</th><th>Time</th><th>Moves</th></tr></thead>
          <tbody>
            {best.map((r, i) => (
              <tr key={i}><td>{modeLabel(r)}</td><td>{dateLabel(r.at)}</td><td>{formatTime(r.time)}</td><td>{r.moves}</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      {!best.length ? (
        <p className="chart-empty">Win a game to set your first record.</p>
      ) : (
        <ol className="runs">
          {best.map((r, i) => (
            <li key={i}>
              <span className="runs-label">
                <b>{modeLabel(r)}</b>
                <small>{dateLabel(r.at)} · {r.moves} moves{r.daily ? ' · Daily' : ''}</small>
              </span>
              <span className="runs-track">
                <span className="runs-bar" style={{ width: `${Math.max(6, (r.time / slowest) * 100)}%` }} />
                <span className="runs-value">{formatTime(r.time)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </ChartFrame>
  );
}
