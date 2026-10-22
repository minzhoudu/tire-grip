"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition } from "react";

/** Lets anything inside the schedule (e.g. a day header) navigate with the same pending feedback as the arrows. */
const NavContext = createContext<(href: string) => void>(() => {});
export const useScheduleGo = () => useContext(NavContext);

/**
 * View toggle + arrows for the schedule. Changing only searchParams doesn't trigger loading.tsx, so the
 * transition's pending state drives the feedback: a spinner by the title and the stale content dimmed.
 */
export function ScheduleNav({
  view,
  dayViewHref,
  multiViewHref,
  title,
  prevHref,
  nextHref,
  todayHref,
  stepLabel,
  children,
}: {
  view: "day" | "multi";
  dayViewHref: string;
  multiViewHref: string;
  title: string;
  prevHref: string;
  nextHref: string;
  /** null when today is already in view */
  todayHref: string | null;
  /** "dan" / "3 dana", for the arrows' labels */
  stepLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (href: string) => startTransition(() => router.push(href));

  return (
    <NavContext.Provider value={go}>
      <div className="flex rounded-xl border-2 border-navy-900 bg-white p-1 text-sm font-semibold">
        {(
          [
            ["day", "Dan", dayViewHref],
            ["multi", "3 dana", multiViewHref],
          ] as const
        ).map(([v, label, href]) => (
          <button
            key={v}
            type="button"
            onClick={() => v !== view && go(href)}
            aria-pressed={v === view}
            className={`flex-1 rounded-lg py-2 ${v === view ? "bg-navy-900 text-white" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-xl border-2 border-navy-900 bg-white p-1">
        <button
          type="button"
          onClick={() => go(prevHref)}
          aria-label={`Prethodni ${stepLabel}`}
          className="grid size-10 place-items-center rounded-lg text-xl font-bold active:bg-slate-100"
        >
          ‹
        </button>
        <p className="flex flex-1 items-center justify-center gap-2 text-center font-semibold" aria-live="polite">
          {pending && (
            <span className="inline-block animate-spin text-base" aria-hidden>
              🛞
            </span>
          )}
          {pending ? "Učitavam…" : title}
        </p>
        <button
          type="button"
          onClick={() => go(nextHref)}
          aria-label={`Sledeći ${stepLabel}`}
          className="grid size-10 place-items-center rounded-lg text-xl font-bold active:bg-slate-100"
        >
          ›
        </button>
      </div>
      {todayHref && (
        <button type="button" onClick={() => go(todayHref)} className="-mt-2 self-center text-sm font-semibold text-navy-700 underline">
          Nazad na danas
        </button>
      )}
      <div aria-busy={pending} className={`transition-opacity ${pending ? "pointer-events-none opacity-40" : ""}`}>
        {children}
      </div>
    </NavContext.Provider>
  );
}
