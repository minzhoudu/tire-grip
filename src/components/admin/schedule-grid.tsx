"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMinutes } from "@/lib/availability/zoned";
import type { BookingStatus } from "@/lib/booking/status";
import { BookingCard, type BookingCardData } from "./booking-card";
import { usePendingNav } from "@/components/ui/pending-nav";

export interface GridItem {
  /** 1-based lane within the column (the bay, in the 3-day view; always 1 in the day view) */
  lane: number;
  fromMin: number;
  toMin: number;
  card: BookingCardData;
  /** Heading of the details sheet, e.g. "Boks 2 · subota 24.10." */
  sheetLabel: string;
}

export interface GridBlock {
  id: string;
  /** null = every lane */
  lane: number | null;
  reason: string | null;
  fromMin: number;
  toMin: number;
}

export interface GridColumn {
  key: string;
  label: string;
  sublabel?: string;
  /** Tapping the header goes here (the 3-day view's day → that day's detailed view). */
  href?: string;
  highlight?: boolean;
  lanes: number;
  /** Working hours that day; empty = closed */
  open: { open: number; close: number }[];
  items: GridItem[];
  blocks: GridBlock[];
  /** Current local time in minutes, only in today's column */
  nowMin: number | null;
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
  { label: "Ne radi se", className: "border-slate-200 bg-slate-100" },
];

/** Parts of [start, end] outside the working hours, to shade. */
function closedSpans(open: GridColumn["open"], start: number, end: number): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  let cursor = start;
  for (const o of [...open].sort((a, b) => a.open - b.open)) {
    if (o.open > cursor) spans.push({ from: cursor, to: Math.min(o.open, end) });
    cursor = Math.max(cursor, o.close);
  }
  if (cursor < end) spans.push({ from: cursor, to: end });
  return spans.filter((s) => s.to > s.from);
}

export function ScheduleGrid({ slug, startMin, endMin, columns }: { slug: string; startMin: number; endMin: number; columns: GridColumn[] }) {
  const router = useRouter();
  const { go } = usePendingNav();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = columns.flatMap((c) => c.items).find((i) => i.card.id === selectedId) ?? null;

  const height = (endMin - startMin) * PPM;
  const top = (min: number) => (Math.max(min, startMin) - startMin) * PPM;
  const span = (from: number, to: number) => Math.max((Math.min(to, endMin) - Math.max(from, startMin)) * PPM, 18);
  const gridLines: number[] = [];
  for (let m = startMin; m <= endMin; m += 30) gridLines.push(m);

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
            <div className="h-11 border-b border-slate-200" />
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

          {columns.map((col) => {
            const header = (
              <>
                <span className="block leading-tight">{col.label}</span>
                {col.sublabel && <span className="block text-[11px] leading-tight font-normal text-slate-500">{col.sublabel}</span>}
              </>
            );
            const headerClass = `flex h-11 w-full flex-col items-center justify-center border-b border-slate-200 text-sm font-semibold ${
              col.highlight ? "bg-accent-400/40" : ""
            }`;
            const laneWidth = 100 / col.lanes;
            const isClosed = col.open.length === 0;

            return (
              <div
                key={col.key}
                className="flex-1 border-l border-slate-200 first:border-l-0"
                style={{ minWidth: Math.max(96, col.lanes * 30) }}
              >
                {col.href ? (
                  <button type="button" onClick={() => go(col.href!)} className={`${headerClass} active:bg-slate-100`} aria-label={`${col.label} ${col.sublabel ?? ""}, otvori dan`}>
                    {header}
                  </button>
                ) : (
                  <div className={headerClass}>{header}</div>
                )}

                <div className="relative" style={{ height }}>
                  {closedSpans(col.open, startMin, endMin).map((s) => (
                    <div key={s.from} className="absolute inset-x-0 bg-slate-100" style={{ top: top(s.from), height: (s.to - s.from) * PPM }} />
                  ))}
                  {isClosed && col.items.length === 0 && (
                    <p className="absolute inset-x-0 top-3 text-center text-xs font-semibold text-slate-400">Zatvoreno</p>
                  )}

                  {gridLines.map((m) => (
                    <div
                      key={m}
                      className={`absolute inset-x-0 border-t ${m % 60 === 0 ? "border-slate-200" : "border-dashed border-slate-200/60"}`}
                      style={{ top: top(m) }}
                    />
                  ))}

                  {col.lanes > 1 &&
                    Array.from({ length: col.lanes - 1 }, (_, i) => (
                      <div key={i} className="absolute inset-y-0 border-l border-dotted border-slate-200" style={{ left: `${(i + 1) * laneWidth}%` }} />
                    ))}

                  {col.blocks.map((b) => (
                    <div
                      key={b.id}
                      className="hatched absolute overflow-hidden rounded-md border border-slate-300 px-1 py-0.5 text-[11px] text-slate-500"
                      style={{
                        top: top(b.fromMin),
                        height: span(b.fromMin, b.toMin) - 2,
                        left: b.lane === null ? 4 : `calc(${(b.lane - 1) * laneWidth}% + 2px)`,
                        width: b.lane === null ? "calc(100% - 8px)" : `calc(${laneWidth}% - 4px)`,
                      }}
                    >
                      {(b.lane === null || col.lanes === 1) && (
                        <>
                          <p className="font-semibold">Blokirano</p>
                          {b.reason && <p className="truncate">{b.reason}</p>}
                        </>
                      )}
                    </div>
                  ))}

                  {col.items.map((it) => {
                    const h = span(it.fromMin, it.toMin) - 2;
                    // Only as much text as fits (lane width and height), so nothing is cut off mid-line; the tap shows the rest.
                    const lines = col.lanes >= 3 ? 0 : col.lanes === 2 ? 1 : h < 40 ? 1 : h < 62 ? 2 : 3;
                    return (
                      <button
                        key={it.card.id}
                        type="button"
                        onClick={() => setSelectedId(it.card.id)}
                        aria-label={`${it.card.timeRange} ${it.card.customerName}`}
                        className={`absolute z-10 overflow-hidden rounded-lg border-2 border-l-4 px-1 text-left leading-tight active:scale-[0.98] ${
                          lines <= 1 ? "py-0.5" : "py-1"
                        } ${STATUS_STYLE[it.card.status] ?? "border-slate-300 bg-white"}`}
                        style={{
                          top: top(it.fromMin),
                          height: h,
                          left: `calc(${(it.lane - 1) * laneWidth}% + 2px)`,
                          width: `calc(${laneWidth}% - 4px)`,
                        }}
                      >
                        {lines === 1 &&
                          (col.lanes === 1 ? (
                            <p className="truncate text-[11px]">
                              <span className="font-mono font-bold">{formatMinutes(it.fromMin)}</span> {it.card.customerName}
                            </p>
                          ) : (
                            <p className="truncate font-mono text-[10px] font-bold">{formatMinutes(it.fromMin)}</p>
                          ))}
                        {lines >= 2 && (
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

                  {col.nowMin !== null && col.nowMin >= startMin && col.nowMin <= endMin && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: top(col.nowMin) }}>
                      <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-label="Detalji termina"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-slate-100 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="font-mono text-sm font-bold text-slate-500 uppercase">{selected.sheetLabel}</p>
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
