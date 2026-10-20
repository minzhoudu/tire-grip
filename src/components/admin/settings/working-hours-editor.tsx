"use client";

import { useState, useTransition } from "react";
import { updateWorkingHoursAction } from "@/app/admin/[slug]/podesavanja/actions";
import type { AffectedBooking } from "@/server/settings";
import { input, primaryButton, resultBanner } from "./ui";

const WEEKDAY_NAMES = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"];

interface Interval {
  opensAt: string;
  closesAt: string;
}

type Day = { weekday: number; intervals: Interval[] };

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function WorkingHoursEditor({ slug, weeklyHours }: { slug: string; weeklyHours: { weekday: number; opensAt: string; closesAt: string }[] }) {
  const [days, setDays] = useState<Day[]>(() =>
    Array.from({ length: 7 }, (_, i) => {
      const weekday = i + 1;
      return {
        weekday,
        intervals: weeklyHours
          .filter((h) => h.weekday === weekday)
          .map((h) => ({ opensAt: hhmm(h.opensAt), closesAt: hhmm(h.closesAt) })),
      };
    }),
  );
  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateInterval(weekday: number, idx: number, patch: Partial<Interval>) {
    setDays((ds) =>
      ds.map((d) => (d.weekday !== weekday ? d : { ...d, intervals: d.intervals.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv)) })),
    );
  }

  function addInterval(weekday: number) {
    setDays((ds) =>
      ds.map((d) => (d.weekday !== weekday ? d : { ...d, intervals: [...d.intervals, { opensAt: "08:00", closesAt: "17:00" }] })),
    );
  }

  function removeInterval(weekday: number, idx: number) {
    setDays((ds) => ds.map((d) => (d.weekday !== weekday ? d : { ...d, intervals: d.intervals.filter((_, i) => i !== idx) })));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAffected(null);
    startTransition(async () => {
      const r = await updateWorkingHoursAction({ slug, days });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAffected(r.affected);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      {days.map((d) => (
        <div key={d.weekday} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{WEEKDAY_NAMES[d.weekday - 1]}</span>
            {d.intervals.length === 0 && <span className="text-xs font-semibold text-slate-400">Zatvoreno</span>}
          </div>
          <div className="flex flex-col gap-2">
            {d.intervals.map((iv, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="time"
                  step={300}
                  className={`${input} py-2`}
                  value={iv.opensAt}
                  onChange={(e) => updateInterval(d.weekday, idx, { opensAt: e.target.value })}
                />
                <span className="text-slate-400">–</span>
                <input
                  type="time"
                  step={300}
                  className={`${input} py-2`}
                  value={iv.closesAt}
                  onChange={(e) => updateInterval(d.weekday, idx, { closesAt: e.target.value })}
                />
                <button type="button" onClick={() => removeInterval(d.weekday, idx)} className="shrink-0 px-2 text-sm font-semibold text-red-700">
                  Ukloni
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addInterval(d.weekday)} className="self-start text-sm font-semibold text-navy-700">
              + Dodaj interval{d.intervals.length > 0 ? " (pauza)" : ""}
            </button>
          </div>
        </div>
      ))}

      {error && resultBanner(false, error)}
      {affected && affected.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">Sačuvano, ali pažnja: {affected.length} zakazan(ih) termin(a) sada pada van radnog vremena:</p>
          <ul className="mt-1 list-disc pl-4">
            {affected.map((a) => (
              <li key={a.id}>
                {a.date} u {a.time} · {a.customerName}
              </li>
            ))}
          </ul>
          <p className="mt-1">Oni nisu pomereni ni otkazani — javite tim kupcima.</p>
        </div>
      )}
      {affected && affected.length === 0 && resultBanner(true, "Sačuvano.")}

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Čuvam…" : "Sačuvaj radno vreme"}
      </button>
    </form>
  );
}
