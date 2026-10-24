"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markSentAction } from "@/app/admin/[slug]/podsetnici/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { formatPhone } from "@/lib/phone";

export interface QueueItem {
  id: string;
  customerName: string;
  customerPhone: string;
  waLink: string;
}

/** Tap a link to open WhatsApp with the message ready; marks it sent right away, same trust model as BookingCard's "Pošalji na WhatsApp". */
export function SendQueue({ slug, campaignId, items }: { slug: string; campaignId: string; items: QueueItem[] }) {
  const router = useRouter();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [loadingNext, startTransition] = useTransition();

  function markSent(id: string) {
    setSent((s) => new Set(s).add(id));
    void markSentAction({ slug, campaignId, messageId: id });
  }

  const remaining = items.filter((i) => !sent.has(i.id));
  if (remaining.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-navy-900 bg-white p-4 text-slate-600">
        <p>Poslali ste svima sa ovog spiska.</p>
        <button
          type="button"
          disabled={loadingNext}
          onClick={() => startTransition(() => router.refresh())}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-3 font-bold text-white disabled:opacity-60"
        >
          {loadingNext ? (
            <>
              <InlineSpinner />
              Učitavam…
            </>
          ) : (
            "Prikaži sledeće kupce"
          )}
        </button>
      </div>
    );
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
