"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Day arrows for the schedule. Changing only ?datum= doesn't trigger loading.tsx, so the
 * transition's pending state drives the feedback: a spinner by the title and the stale day dimmed.
 */
export function ScheduleDayNav({
  title,
  prevHref,
  nextHref,
  todayHref,
  children,
}: {
  title: string;
  prevHref: string;
  nextHref: string;
  /** null when already showing today */
  todayHref: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (href: string) => startTransition(() => router.push(href));

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border-2 border-navy-900 bg-white p-1">
        <button
          type="button"
          onClick={() => go(prevHref)}
          aria-label="Prethodni dan"
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
          aria-label="Sledeći dan"
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
    </>
  );
}
