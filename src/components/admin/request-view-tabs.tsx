"use client";

import { useState } from "react";
import { InlineSpinner } from "@/components/ui/busy";
import { PendingLink, usePendingNav } from "@/components/ui/pending-nav";

/**
 * "Predstojeći / Istorija" on the Zahtevi page. The other tab is prefetched with its data, so
 * switching is usually instant; otherwise the tapped tab shows a spinner until its list arrives.
 */
export function RequestViewTabs({ view, upcomingHref, historyHref }: { view: "upcoming" | "history"; upcomingHref: string; historyHref: string }) {
  const { pending } = usePendingNav();
  const [target, setTarget] = useState<"upcoming" | "history" | null>(null);
  // While loading, the highlight already moves to the tapped tab, so only one tab ever looks active.
  const shown = pending && target ? target : view;

  return (
    <div className="flex rounded-xl border-2 border-navy-900 bg-white p-1 text-sm font-semibold">
      {(
        [
          ["upcoming", "Predstojeći", upcomingHref],
          ["history", "Istorija", historyHref],
        ] as const
      ).map(([v, label, href]) => {
        const loading = pending && target === v;
        const className = `flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 ${
          shown === v ? "bg-navy-900 text-white" : "text-slate-600"
        }`;
        return view === v ? (
          <span key={v} aria-current="page" className={className}>
            {label}
          </span>
        ) : (
          <PendingLink key={v} href={href} prefetch onClick={() => setTarget(v)} className={className}>
            {loading && <InlineSpinner className="text-xs" />}
            {label}
          </PendingLink>
        );
      })}
    </div>
  );
}
