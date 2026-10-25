"use client";

import { useState, useTransition } from "react";
import { loadHistoryAction } from "@/app/admin/[slug]/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";
import type { HistoryCursor } from "@/server/admin";
import type { HistoryItem } from "@/server/history";
import { BookingCard } from "./booking-card";

/** Istorija: the first page comes with the page, "Učitaj još" appends the next one. */
export function HistoryList({ slug, initial, initialNext }: { slug: string; initial: HistoryItem[]; initialNext: HistoryCursor | null }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!next) return;
    startTransition(async () => {
      const r = await loadHistoryAction({ slug, cursor: next });
      if (!r.ok) {
        toast("Učitavanje nije uspelo. Pokušajte ponovo.", "error");
        return;
      }
      // A booking can't show twice even if the list changed in between (e.g. one just got cancelled).
      setItems((old) => {
        const seen = new Set(old.map((i) => i.card.id));
        return [...old, ...r.items.filter((i) => !seen.has(i.card.id))];
      });
      setNext(r.next);
    });
  }

  if (items.length === 0) {
    return <div className="rounded-2xl border-2 border-navy-900 bg-white p-6 text-center text-slate-600">Još nema ranijih termina.</div>;
  }

  // Consecutive items of the same day share one heading (the list is newest first).
  const groups: { date: string; heading: string; items: HistoryItem[] }[] = [];
  for (const it of items) {
    const last = groups.at(-1);
    if (last?.date === it.date) last.items.push(it);
    else groups.push({ date: it.date, heading: it.heading, items: [it] });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.date} aria-label={g.heading}>
          <h2 className="mb-2 px-1 font-mono text-sm font-bold tracking-wide text-slate-500 uppercase">{g.heading}</h2>
          <div className="flex flex-col gap-3">
            {g.items.map((it) => (
              <BookingCard key={it.card.id} slug={slug} booking={it.card} />
            ))}
          </div>
        </section>
      ))}

      {next ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-navy-900 bg-white px-4 py-3 font-bold active:scale-[0.98] disabled:opacity-70"
        >
          {pending ? (
            <>
              <InlineSpinner />
              Učitavam…
            </>
          ) : (
            "Učitaj još"
          )}
        </button>
      ) : (
        <p className="px-1 text-center text-sm text-slate-500">To su svi raniji termini.</p>
      )}
    </div>
  );
}
