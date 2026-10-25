"use client";

import { useState, useTransition } from "react";
import { changeStatusAction, completeBookingsAction } from "@/app/admin/[slug]/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";

export interface PastBookingItem {
  id: string;
  /** "Danas" / "Juče" / "pet 23.10." */
  dayLabel: string;
  time: string;
  customerName: string;
  serviceName: string;
  bay: number | null;
}

type Outcome = "completed" | "no_show";

/**
 * Confirmed bookings that are over, waiting for "Završeno" or "Nije došao". Mark the no-shows,
 * then "Svi su došli" closes the rest. Whatever is left open is closed as completed after 7 days.
 */
export function PastBookingsToClose({ slug, items, autoDays }: { slug: string; items: PastBookingItem[]; autoDays: number }) {
  const toast = useToast();
  const [closed, setClosed] = useState<Map<string, Outcome>>(new Map());
  const [busy, setBusy] = useState<{ id: string; action: "complete" | "noShow" } | "all" | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [pending, startTransition] = useTransition();

  const open = items.filter((i) => !closed.has(i.id));
  if (items.length === 0) return null;

  function closeOne(id: string, action: "complete" | "noShow") {
    setConfirmAll(false);
    setBusy({ id, action });
    startTransition(async () => {
      const r = await changeStatusAction({ slug, bookingId: id, action });
      if (r.ok) {
        setClosed((m) => new Map(m).set(id, r.status === "no_show" ? "no_show" : "completed"));
      } else if (r.reason === "not_allowed") {
        // Already closed elsewhere (other device): just drop it from the list.
        setClosed((m) => new Map(m).set(id, "completed"));
      } else {
        toast("Nije uspelo. Pokušajte ponovo.", "error");
      }
    });
  }

  function closeAll() {
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
    const ids = open.map((i) => i.id);
    setBusy("all");
    startTransition(async () => {
      const r = await completeBookingsAction({ slug, ids });
      if (!r.ok) {
        toast("Nije uspelo. Pokušajte ponovo.", "error");
        return;
      }
      setClosed((m) => {
        const next = new Map(m);
        for (const id of ids) next.set(id, "completed");
        return next;
      });
      toast(r.completed === 1 ? "1 termin je označen kao završen." : `Završeno: ${r.completed} termina.`);
    });
  }

  if (open.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4" aria-label="Prošli termini">
        <span className="text-2xl" aria-hidden>
          ✅
        </span>
        <p className="font-semibold">Svi prošli termini su zaključeni.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-navy-900 bg-amber-50 p-4" aria-label="Prošli termini za zaključiti">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          🏁
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Prošli termini za zaključiti ({open.length})</p>
          <p className="text-sm text-slate-600">
            Označite ko nije došao, pa „Svi su došli“ za ostale. Posle {autoDays} dana se sami označe kao završeni.
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((it) => {
          const outcome = closed.get(it.id);
          const rowBusy = pending && ((busy !== "all" && busy?.id === it.id) || (busy === "all" && !outcome));
          return (
            <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white px-3 py-2.5">
              <span className="w-16 shrink-0 leading-tight">
                <span className="block text-xs text-slate-500">{it.dayLabel}</span>
                <span className="block font-mono text-sm font-bold">{it.time}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{it.customerName}</span>
                <span className="block truncate text-xs text-slate-500">
                  {it.serviceName}
                  {it.bay !== null && ` · boks ${it.bay}`}
                </span>
              </span>
              {outcome ? (
                <span className={`shrink-0 text-sm font-semibold ${outcome === "no_show" ? "text-red-700" : "text-emerald-700"}`}>
                  {outcome === "no_show" ? "Nije došao" : "Završeno ✓"}
                </span>
              ) : (
                <span className="flex shrink-0 gap-2">
                  {(["noShow", "complete"] as const).map((action) => {
                    const spinning = rowBusy && (busy === "all" ? action === "complete" : busy?.action === action);
                    return (
                      <button
                        key={action}
                        type="button"
                        disabled={pending}
                        onClick={() => closeOne(it.id, action)}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold active:scale-[0.98] ${
                          spinning ? "" : "disabled:opacity-50"
                        } ${action === "complete" ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                      >
                        {spinning && <InlineSpinner />}
                        {action === "complete" ? "Završeno" : "Nije došao"}
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {open.length > 1 && (
        <button
          type="button"
          disabled={pending}
          onClick={closeAll}
          className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 font-bold active:scale-[0.98] disabled:opacity-60 ${
            confirmAll ? "bg-emerald-700 text-white" : "border-2 border-navy-900 bg-white text-navy-900"
          }`}
        >
          {pending && busy === "all" ? (
            <>
              <InlineSpinner />
              Čuvam…
            </>
          ) : confirmAll ? (
            `Sigurno? Označi ${open.length} kao završene`
          ) : (
            `Svi su došli (${open.length})`
          )}
        </button>
      )}
    </section>
  );
}
