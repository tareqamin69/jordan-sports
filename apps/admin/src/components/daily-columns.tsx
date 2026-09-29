'use client';

import { axisTicks } from '@jordan-sports/money';
import { useId, useState } from 'react';

const W = 640;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 44 };

/**
 * A single-series column chart over days (dataviz spec: ≤24px columns, 4px rounded data end,
 * hairline grid, per-column hover/focus tooltip, table view for every value). Time runs left to
 * right in both languages.
 */
export function DailyColumns({
  title,
  points,
  formatValue,
  formatDate,
  tableLabel,
  formatTick,
  minStep = 1,
}: {
  title: string;
  points: ReadonlyArray<{ date: string; value: number }>;
  formatValue: (v: number) => string;
  formatDate: (date: string) => string;
  tableLabel: string;
  /** Axis label for a tick (defaults to `formatValue`); money uses whole dinars. */
  formatTick?: (v: number) => string;
  /** Smallest axis step in value units (e.g. 1000 fils = 1 JOD). */
  minStep?: number;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const ticks = axisTicks(Math.max(...points.map((p) => p.value), 0), minStep);
  const max = ticks.at(-1)!;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(points.length, 1);
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(points.length / 7);
  const active = hover === null ? null : points[hover];

  return (
    <figure className="flex flex-col gap-2" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="text-sm font-medium text-ink">
        {title}
      </figcaption>
      <div className="relative" dir="ltr">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label={title}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-ink-muted text-[11px] tabular-nums"
              >
                {(formatTick ?? formatValue)(tick)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = PAD.left + band * i + band / 2;
            const top = y(p.value);
            const h = PAD.top + plotH - top;
            const r = Math.min(4, h, barW / 2);
            const x0 = cx - barW / 2;
            const x1 = cx + barW / 2;
            const base = PAD.top + plotH;
            return (
              <g
                key={p.date}
                tabIndex={0}
                role="listitem"
                aria-label={`${formatDate(p.date)}: ${formatValue(p.value)}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                {/* Hit target: the whole day band, bigger than the mark. */}
                <rect
                  x={cx - band / 2}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                />
                {h > 0 ? (
                  <path
                    d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${base} Z`}
                    fill="var(--color-primary)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                ) : null}
                {i % labelEvery === 0 || i === points.length - 1 ? (
                  <text x={cx} y={H - 6} textAnchor="middle" className="fill-ink-muted text-[11px]">
                    {formatDate(p.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {active && hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-night px-3 py-2 text-xs text-canvas shadow-lift"
            style={{ left: `${((PAD.left + band * hover + band / 2) / W) * 100}%` }}
            role="status"
          >
            <strong className="block text-sm tabular-nums">{formatValue(active.value)}</strong>
            {formatDate(active.date)}
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-muted">{tableLabel}</summary>
        <table className="mt-2 w-full text-start">
          <tbody className="divide-y divide-line">
            {points.map((p) => (
              <tr key={p.date}>
                <td className="py-1">{formatDate(p.date)}</td>
                <td className="py-1 text-end tabular-nums">{formatValue(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
