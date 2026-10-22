"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMinutes } from "@/lib/availability/zoned";
import type { BookingStatus } from "@/lib/booking/status";
import { BookingCard, type BookingCardData } from "./booking-card";

export interface ScheduleItem {
  /** Real bay number (even when the shop has 1 bay; card.bay is null then). */
  bay: number;
  fromMin: number;
  toMin: number;
  card: BookingCardData;
}

export interface ScheduleBlock {
  id: string;
  /** null = the whole shop */
  bay: number | null;
  reason: string | null;
  fromMin: number;
  toMin: number;
}

/** 1.6 px per minute: an hour is 96px, a 30-min booking is tall enough for time + name + service. */
const PPM = 1.6;

const STATUS_STYLE: Partial<Record<BookingStatus, string>> = {
  pending: "border-amber-400 border-dashed bg-amber-50 text-amber-950",
  confirmed: "border-emerald-600 bg-emerald-50 text-emerald-950",
  completed: "border-slate-400 bg-slate-100 text-slate-500",
  no_show: "border-red-400 bg-red-50 text-red-800",
};

const LEGEND: { label: string; className: string }[] = [
  { label: "Čeka potvrdu", className: "border-amber-400 border-dashed bg-amber-50" },
  { label: "Potvrđen", className: "border-emerald-600 bg-emerald-50" },
  { label: "Završen", className: "border-slate-400 bg-slate-100" },
  { label: "Blokirano", className: "border-slate-300 hatched" },
];

export function DaySchedule({
  slug,
  bays,
  startMin,
  endMin,
  items,
  blocks,
  nowMin,
}: {
  slug: string;
  bays: number;
  startMin: number;
  endMin: number;
  items: ScheduleItem[];
  blocks: ScheduleBlock[];
  /** Current local time in minutes, only when showing today. */
  nowMin: number | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((i) => i.card.id === selectedId) ?? null;

  const columns = Math.max(bays, ...items.map((i) => i.bay));
  const height = (endMin - startMin) * PPM;
  const top = (min: number) => (Math.max(min, startMin) - startMin) * PPM;
  const span = (from: number, to: number) => Math.max((Math.min(to, endMin) - Math.max(from, startMin)) * PPM, 18);
  const gridLines: number[] = [];
  for (let m = startMin; m <= endMin; m += 30) gridLines.push(m);
  const showNow = nowMin !== null && nowMin >= startMin && nowMin <= endMin;

  function close() {
    setSelectedId(null);
    router.refresh(); // the card may have changed the booking's status
  }

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs text-slate-600">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`size-3 rounded-sm border-2 ${l.className}`} aria-hidden />
            {l.label}
          </span>
        ))}
      </div>

      {/* isolate: the sticky time column and booking z-indexes must not climb over the admin header/menu. */}
      <div className="isolate overflow-x-auto rounded-2xl border-2 border-navy-900 bg-white">
        <div className="flex min-w-fit">
          <div className="sticky left-0 z-20 w-11 shrink-0 border-r border-slate-200 bg-white">
            <div className="h-9 border-b border-slate-200" />
            <div className="relative" style={{ height }}>
              {gridLines
                .filter((m) => m % 60 === 0 && m < endMin)
                .map((m) => (
                  <span key={m} className="absolute right-1.5 font-mono text-[11px] text-slate-400" style={{ top: top(m) + 2 }}>
                    {formatMinutes(m)}
                  </span>
                ))}
            </div>
          </div>

          {Array.from({ length: columns }, (_, i) => i + 1).map((bay) => (
            <div key={bay} className="min-w-[6rem] flex-1 border-l border-slate-200 first:border-l-0">
              <div className="flex h-9 items-center justify-center border-b border-slate-200 text-sm font-semibold">Boks {bay}</div>
              <div className="relative" style={{ height }}>
                {gridLines.map((m) => (
                  <div
                    key={m}
                    className={`absolute inset-x-0 border-t ${m % 60 === 0 ? "border-slate-200" : "border-dashed border-slate-100"}`}
                    style={{ top: top(m) }}
                  />
                ))}

                {blocks
                  .filter((b) => b.bay === null || b.bay === bay)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="hatched absolute inset-x-1 overflow-hidden rounded-lg border border-slate-300 px-1.5 py-1 text-[11px] text-slate-500"
                      style={{ top: top(b.fromMin), height: span(b.fromMin, b.toMin) - 2 }}
                    >
                      <p className="font-semibold">Blokirano</p>
                      {b.reason && <p className="truncate">{b.reason}</p>}
                    </div>
                  ))}

                {items
                  .filter((it) => it.bay === bay)
                  .map((it) => {
                    const h = span(it.fromMin, it.toMin) - 2;
                    // Only as many lines as fit, so nothing is cut off mid-line; the tap shows the rest.
                    const lines = h < 40 ? 1 : h < 62 ? 2 : 3;
                    return (
                      <button
                        key={it.card.id}
                        type="button"
                        onClick={() => setSelectedId(it.card.id)}
                        className={`absolute inset-x-1 z-10 overflow-hidden rounded-lg border-2 border-l-4 px-1.5 text-left leading-tight active:scale-[0.98] ${
                          lines === 1 ? "py-0.5" : "py-1"
                        } ${STATUS_STYLE[it.card.status] ?? "border-slate-300 bg-white"}`}
                        style={{ top: top(it.fromMin), height: h }}
                      >
                        {lines === 1 ? (
                          <p className="truncate text-[11px]">
                            <span className="font-mono font-bold">{formatMinutes(it.fromMin)}</span> {it.card.customerName}
                          </p>
                        ) : (
                          <>
                            <p className="truncate font-mono text-[11px] font-bold">{it.card.timeRange}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold">{it.card.customerName}</p>
                            {lines === 3 && (
                              <p className="mt-0.5 truncate text-[11px] opacity-80">
                                {it.card.vehicleTypeIcon} {it.card.serviceName}
                              </p>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}

                {showNow && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: top(nowMin!) }}>
                    {bay === 1 && <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-red-500" />}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-label="Detalji termina"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-slate-100 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="font-mono text-sm font-bold text-slate-500 uppercase">Boks {selected.bay}</p>
              <button type="button" onClick={close} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold">
                Zatvori
              </button>
            </div>
            <BookingCard key={selected.card.id} slug={slug} booking={selected.card} />
          </div>
        </>
      )}
    </div>
  );
}
