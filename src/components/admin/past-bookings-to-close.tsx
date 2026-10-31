"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { changeStatusAction, completeBookingsAction } from "@/app/admin/[slug]/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";
import { formatRsd } from "@/lib/availability/labels";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { SupportDeleteButton } from "./support-delete-button";
import { useSupportMode } from "./support-mode";

export interface PastBookingItem {
  id: string;
  /** "Danas" / "Juče" / "pet 23.10." */
  dayLabel: string;
  time: string;
  customerName: string;
  serviceName: string;
  bay: number | null;
  /* shown when the row is opened */
  customerPhone: string;
  /** "🚗 Putničko · Golf 7" */
  vehicle: string;
  priceRsd: number;
  customerNote: string | null;
  customerNoShows: number;
  /** Customer's page in Kupci, or null when the plan doesn't include it */
  customerUrl: string | null;
}

/** "deleted" = removed from the database in a support session */
type Outcome = "completed" | "no_show" | "deleted";

/**
 * Confirmed bookings that are over, waiting for "Završeno" or "Nije došao". Mark the no-shows,
 * then "Svi su došli" closes the rest. Whatever is left open is closed as completed after 7 days.
 */
export function PastBookingsToClose({ slug, items, autoDays }: { slug: string; items: PastBookingItem[]; autoDays: number }) {
  const toast = useToast();
  const [closed, setClosed] = useState<Map<string, Outcome>>(new Map());
  const [busy, setBusy] = useState<{ id: string; action: "complete" | "noShow" } | "all" | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

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
          const isOpen = expanded.has(it.id);
          return (
            <li key={it.id} className="rounded-xl bg-white">
              {/* Phones: actions get their own row under the name, so the name and service stay readable. */}
              <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={() => toggle(it.id)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="w-16 shrink-0 leading-tight">
                    <span className="block text-xs text-slate-500">{it.dayLabel}</span>
                    <span className="block font-mono text-sm font-bold">{it.time}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-semibold ${isOpen ? "" : "truncate"}`}>{it.customerName}</span>
                    <span className={`block text-xs text-slate-500 ${isOpen ? "" : "truncate"}`}>
                      {it.serviceName}
                      {it.bay !== null && ` · boks ${it.bay}`}
                    </span>
                  </span>
                  <span aria-hidden className={`shrink-0 text-xl text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                    ›
                  </span>
                </button>
                {outcome ? (
                  <span
                    className={`text-sm font-semibold sm:shrink-0 ${
                      outcome === "no_show" ? "text-red-700" : outcome === "deleted" ? "text-slate-500" : "text-emerald-700"
                    }`}
                  >
                    {outcome === "no_show" ? "Nije došao" : outcome === "deleted" ? "🗑️ Obrisano" : "Završeno ✓"}
                  </span>
                ) : (
                  <span className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    {(["noShow", "complete"] as const).map((action) => {
                      const spinning = rowBusy && (busy === "all" ? action === "complete" : busy?.action === action);
                      return (
                        <button
                          key={action}
                          type="button"
                          disabled={pending}
                          onClick={() => closeOne(it.id, action)}
                          className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold active:scale-[0.98] ${
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
              </div>
              {isOpen && outcome !== "deleted" && (
                <PastBookingDetails
                  slug={slug}
                  item={it}
                  onDeleted={() => setClosed((m) => new Map(m).set(it.id, "deleted"))}
                />
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

/** Opened row: how to reach the customer and what they booked, for deciding "Završeno" vs "Nije došao". */
function PastBookingDetails({ slug, item: it, onDeleted }: { slug: string; item: PastBookingItem; onDeleted: () => void }) {
  const supportMode = useSupportMode();
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 px-3 pt-2.5 pb-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a href={`tel:${it.customerPhone}`} className="font-medium text-navy-700">
          📞 {formatPhone(it.customerPhone)}
        </a>
        <a href={whatsappLink(it.customerPhone, `Zdravo ${it.customerName}, `)} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700">
          WhatsApp
        </a>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-slate-600">{it.vehicle}</span>
        <span className="shrink-0 font-mono font-bold tabular-nums text-rust-600">{formatRsd(it.priceRsd)}</span>
      </div>
      {it.customerNoShows > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 font-medium text-red-800">
          ⚠️ Ovaj kupac {it.customerNoShows === 1 ? "je već jednom propustio" : `je već ${it.customerNoShows} puta propustio`} termin.
        </p>
      )}
      {it.customerNote && <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">📝 {it.customerNote}</p>}
      {it.customerUrl && (
        <Link href={it.customerUrl} className="self-start font-semibold text-navy-700">
          Profil kupca ›
        </Link>
      )}
      {supportMode && <SupportDeleteButton slug={slug} bookingId={it.id} onDeleted={onDeleted} />}
    </div>
  );
}
