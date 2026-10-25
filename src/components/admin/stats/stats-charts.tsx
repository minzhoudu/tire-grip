"use client";

import { useState } from "react";
import { formatRsd } from "@/lib/availability/labels";
import { ColumnChart } from "./column-chart";

/** "2026-10-13" → "13.10." */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const terminLabel = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "termin" : "termina");

/** Weeks as columns; one measure at a time (switch), never two scales on one chart. */
export function WeeklyChart({ weeks }: { weeks: { weekStart: string; count: number; revenueRsd: number }[] }) {
  const [measure, setMeasure] = useState<"count" | "revenue">("count");
  const last = weeks.length - 1;

  return (
    <section className="rounded-2xl border-2 border-navy-900 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">{measure === "count" ? "Termini po nedelji" : "Promet po nedelji"}</p>
        <div className="flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Prikaz">
          {(
            [
              ["count", "Termini"],
              ["revenue", "Promet"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={measure === key}
              onClick={() => setMeasure(key)}
              className={`rounded-full px-3 py-1 ${measure === key ? "bg-navy-900 text-white" : "text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ColumnChart
        unit={measure === "count" ? "Termina" : "Promet"}
        formatValue={measure === "count" ? (n) => `${n} ${terminLabel(n)}` : formatRsd}
        data={weeks.map((w, i) => ({
          key: w.weekStart,
          label: shortDate(w.weekStart),
          value: measure === "count" ? w.count : w.revenueRsd,
          detail: `${shortDate(w.weekStart)}–${shortDate(addDaysIso(w.weekStart, 6))}${i === last ? " · ova nedelja" : ""}`,
        }))}
      />
      {measure === "revenue" && <p className="mt-3 text-xs text-slate-500">Promet računa samo termine označene kao završene.</p>}
    </section>
  );
}

const WEEKDAY_SHORT = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
const WEEKDAY_LONG = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"];

/** Busiest weekday stands out (ink); the others are gray context. */
export function WeekdayChart({ byWeekday }: { byWeekday: { weekday: number; count: number }[] }) {
  const sorted = [...byWeekday].sort((a, b) => a.weekday - b.weekday);
  return (
    <section className="rounded-2xl border-2 border-navy-900 bg-white p-4">
      <p className="mb-4 text-sm font-semibold text-slate-700">Najprometniji dani</p>
      <ColumnChart
        unit="Termina"
        emphasize="max"
        capLabels
        height={110}
        formatValue={(n) => `${n} ${terminLabel(n)}`}
        data={sorted.map((d) => ({
          key: String(d.weekday),
          label: WEEKDAY_SHORT[d.weekday - 1]!,
          value: d.count,
          detail: WEEKDAY_LONG[d.weekday - 1]!,
        }))}
      />
    </section>
  );
}
