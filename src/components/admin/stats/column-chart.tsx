"use client";

import { useState } from "react";

export interface ColumnDatum {
  key: string;
  /** Under the column, e.g. "12.10." or "Pon" */
  label: string;
  value: number;
  /** Tooltip heading, e.g. "12.10.–18.10." */
  detail: string;
}

/** 0 / 1 / 2 / 5 / 10 / 20 / 50…: the smallest clean number at or above `n`. */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 5, 10]) if (step * pow >= n) return step * pow;
  return 10 * pow;
}

/** Axis ticks: 1.500 → "1,5K", 12.000 → "12K" */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1).replace(".", ",")}K`;
}

/**
 * One-series column chart: hairline grid with clean ticks, columns capped at 24px with a 4px
 * rounded top, a tooltip per column on hover / tap / keyboard focus, and a table for screen readers.
 * `emphasize` = "max" paints only the biggest column in ink and the rest gray, for "which one stands out".
 */
export function ColumnChart({
  data,
  formatValue,
  unit,
  emphasize,
  capLabels = false,
  height = 140,
}: {
  data: ColumnDatum[];
  formatValue: (n: number) => string;
  /** Screen-reader column header for the values, e.g. "Termina" */
  unit: string;
  emphasize?: "max";
  /** Bare number on top of every column (fine for a handful of columns); the tooltip has the full value. */
  capLabels?: boolean;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = niceCeil(max);
  const ticks = [top, top / 2, 0].filter((t, i, a) => Number.isInteger(t) && a.indexOf(t) === i);
  const n = data.length;
  const empty = max === 0;

  return (
    <div className="relative">
      <div className="flex gap-2" aria-hidden>
        {/* y-axis ticks */}
        <div className="relative w-8 shrink-0" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 font-mono text-[10px] text-slate-400 tabular-nums" style={{ top: height - (t / top) * height }}>
              {compact(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: height - (t / top) * height }} />
            ))}

            {empty && (
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-slate-500">Nema termina u ovom periodu.</p>
            )}

            <div className="absolute inset-0 flex">
              {data.map((d, i) => {
                const h = (d.value / top) * height;
                const strong = emphasize !== "max" || (d.value === max && max > 0);
                return (
                  <div
                    key={d.key}
                    tabIndex={empty ? -1 : 0}
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={() => setActive(i)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                  >
                    {d.value > 0 && (
                      <div
                        className={`w-full max-w-6 rounded-t-[4px] transition-opacity ${strong ? "bg-navy-900" : "bg-slate-300"} ${
                          active === i ? "opacity-80" : ""
                        } group-focus-visible:ring-2 group-focus-visible:ring-accent-500`}
                        style={{ height: Math.max(h, 3) }}
                      />
                    )}
                    {capLabels && d.value > 0 && (
                      <span
                        className={`absolute font-mono text-[11px] tabular-nums ${strong ? "font-bold text-slate-800" : "text-slate-500"}`}
                        style={{ bottom: Math.max(h, 3) + 3 }}
                      >
                        {compact(d.value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {active !== null && !empty && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg bg-navy-900 px-2.5 py-1.5 text-white shadow-lg"
                style={{
                  // Above the column, but never out of the plot (over the title): on a tall column it sits on top of it.
                  bottom: Math.min(Math.max((data[active]!.value / top) * height, 3) + (capLabels ? 20 : 8), height - 40),
                  left: `${((active + 0.5) / n) * 100}%`,
                  transform: `translateX(${active === 0 ? "-20%" : active === n - 1 ? "-80%" : "-50%"})`,
                }}
              >
                <p className="font-mono text-sm leading-tight font-bold whitespace-nowrap">{formatValue(data[active]!.value)}</p>
                <p className="text-[11px] leading-tight whitespace-nowrap text-slate-300">{data[active]!.detail}</p>
              </div>
            )}
          </div>

          {/* x-axis labels */}
          <div className="mt-1.5 flex">
            {data.map((d, i) => (
              <span key={d.key} className={`flex-1 text-center text-[11px] ${active === i ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <thead>
          <tr>
            <th>Period</th>
            <th>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.detail}</td>
              <td>{formatValue(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
