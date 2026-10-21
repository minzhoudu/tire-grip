"use client";

import { useState } from "react";
import { markSentAction } from "@/app/admin/[slug]/podsetnici/actions";
import { formatPhone } from "@/lib/phone";

export interface QueueItem {
  id: string;
  customerName: string;
  customerPhone: string;
  waLink: string;
}

/** Tap a link to open WhatsApp with the message ready; marks it sent right away, same trust model as BookingCard's "Pošalji na WhatsApp". */
export function SendQueue({ slug, campaignId, items }: { slug: string; campaignId: string; items: QueueItem[] }) {
  const [sent, setSent] = useState<Set<string>>(new Set());

  function markSent(id: string) {
    setSent((s) => new Set(s).add(id));
    void markSentAction({ slug, campaignId, messageId: id });
  }

  const remaining = items.filter((i) => !sent.has(i.id));
  if (remaining.length === 0) {
    return <p className="rounded-2xl border-2 border-navy-900 bg-white p-4 text-slate-600">Sve poslato za danas. Vratite se sutra za sledeću talas.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {remaining.map((item) => (
        <li key={item.id} className="flex items-center gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{item.customerName}</p>
            <p className="text-sm text-slate-600">{formatPhone(item.customerPhone)}</p>
          </div>
          <a
            href={item.waLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => markSent(item.id)}
            className="shrink-0 rounded-xl border-2 border-navy-900 bg-[#25d366] px-4 py-3 text-center font-bold text-white active:scale-[0.98]"
          >
            📲 Pošalji
          </a>
        </li>
      ))}
    </ul>
  );
}
