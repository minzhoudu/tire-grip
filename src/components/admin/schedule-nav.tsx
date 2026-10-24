"use client";

import { InlineSpinner } from "@/components/ui/busy";
import { PendingArea, PendingLink, PendingNavProvider, usePendingNav } from "@/components/ui/pending-nav";

interface Props {
  /** Changes with every view (date + day/3-day), so a view served from the prefetch cache gets refreshed. */
  routeKey: string;
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
}

/** View toggle + arrows for the schedule. The arrows prefetch the neighbouring days, so they're usually instant. */
export function ScheduleNav(props: Props) {
  return (
    <PendingNavProvider routeKey={props.routeKey}>
      <ScheduleNavControls {...props} />
      <PendingArea>{props.children}</PendingArea>
    </PendingNavProvider>
  );
}

function ScheduleNavControls({ view, dayViewHref, multiViewHref, title, prevHref, nextHref, todayHref, stepLabel }: Props) {
  const { pending } = usePendingNav();

  return (
    <>
      <div className="flex rounded-xl border-2 border-navy-900 bg-white p-1 text-sm font-semibold">
        {(
          [
            ["day", "Dan", dayViewHref],
            ["multi", "3 dana", multiViewHref],
          ] as const
        ).map(([v, label, href]) =>
          v === view ? (
            <span key={v} aria-current="page" className="flex-1 rounded-lg bg-navy-900 py-2 text-center text-white">
              {label}
            </span>
          ) : (
            <PendingLink key={v} href={href} className="flex-1 rounded-lg py-2 text-center text-slate-600">
              {label}
            </PendingLink>
          ),
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl border-2 border-navy-900 bg-white p-1">
        <PendingLink
          href={prevHref}
          prefetch
          aria-label={`Prethodni ${stepLabel}`}
          className="grid size-10 place-items-center rounded-lg text-xl font-bold active:bg-slate-100"
        >
          ‹
        </PendingLink>
        <p className="flex flex-1 items-center justify-center gap-2 text-center font-semibold" aria-live="polite">
          {pending && <InlineSpinner className="text-base" />}
          {pending ? "Učitavam…" : title}
        </p>
        <PendingLink
          href={nextHref}
          prefetch
          aria-label={`Sledeći ${stepLabel}`}
          className="grid size-10 place-items-center rounded-lg text-xl font-bold active:bg-slate-100"
        >
          ›
        </PendingLink>
      </div>
      {todayHref && (
        <PendingLink href={todayHref} className="-mt-2 self-center text-sm font-semibold text-navy-700 underline">
          Nazad na danas
        </PendingLink>
      )}
    </>
  );
}
