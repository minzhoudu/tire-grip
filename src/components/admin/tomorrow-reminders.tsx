"use client";

import { useState } from "react";
import { sendReminder, useSentReminders } from "./reminder-store";

export interface ReminderItem {
  id: string;
  time: string;
  customerName: string;
  serviceName: string;
  /** wa.me link with the reminder message already filled in */
  url: string;
  sent: boolean;
}

/** Confirmed bookings for tomorrow, each with a one-tap WhatsApp reminder. Shown on the Zahtevi page. */
export function TomorrowReminders({ slug, dayLabel, items }: { slug: string; dayLabel: string; items: ReminderItem[] }) {
  const sentHere = useSentReminders();
  const isSent = (r: ReminderItem) => sentHere(r.id, r.sent);
  const sentCount = items.filter(isSent).length;
  const allSent = sentCount === items.length;
  const [open, setOpen] = useState(!items.every((r) => r.sent));

  function send(id: string) {
    sendReminder(slug, id);
  }

  return (
    <section className={`rounded-2xl border-2 border-navy-900 p-4 ${allSent ? "bg-white" : "bg-amber-50"}`} aria-label="Podsetnici za sutra">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="text-2xl" aria-hidden>
          {allSent ? "✅" : "🔔"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Podsetnici za sutra</span>
          <span className="block text-sm text-slate-600">
            {allSent ? `Svim kupcima je poslat podsetnik (${items.length})` : `Poslato ${sentCount} od ${items.length} · ${dayLabel}`}
          </span>
        </span>
        <span className="shrink-0 text-xl text-slate-400" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <>
          <p className="mt-3 text-sm text-slate-600">
            Dodirnite „Pošalji“ i WhatsApp se otvara sa gotovom porukom: vreme, usluga, adresa i link za otkazivanje. Vi samo pošaljete.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5">
                <span className="w-12 shrink-0 font-mono text-sm font-bold">{r.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.customerName}</span>
                  <span className="block truncate text-xs text-slate-500">{r.serviceName}</span>
                </span>
                {isSent(r) ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => send(r.id)}
                    className="shrink-0 text-right text-sm font-semibold text-emerald-700"
                  >
                    Poslato ✓
                    <span className="block text-xs font-normal text-slate-500 underline">Pošalji ponovo</span>
                  </a>
                ) : (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => send(r.id)}
                    className="shrink-0 rounded-xl bg-[#25d366] px-4 py-2.5 text-sm font-bold text-white active:scale-[0.98]"
                  >
                    Pošalji
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
