"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { changeStatusAction } from "@/app/admin/[slug]/actions";
import { useToast } from "@/components/ui/toast";
import { formatRsd } from "@/lib/availability/labels";
import { vehicleTypeIcons, vehicleTypeLabels } from "@/lib/booking/messages";
import { ACTIONS, STATUS_LABELS, type BookingAction, type BookingStatus } from "@/lib/booking/status";
import { formatPhone, whatsappLink } from "@/lib/phone";

export interface BookingCardData {
  id: string;
  status: BookingStatus;
  actions: BookingAction[];
  timeRange: string;
  serviceName: string;
  vehicleType: "car" | "suv" | "van";
  vehicleLabel: string | null;
  customerName: string;
  customerPhone: string;
  customerNote: string | null;
  priceRsd: number;
  /** Shown only when the shop has more than one bay */
  bay: number | null;
  byPhone: boolean;
}

const STATUS_STYLES: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-500 line-through",
  rejected: "bg-slate-200 text-slate-500 line-through",
  no_show: "bg-red-100 text-red-800",
};

const ACTION_STYLES: Record<BookingAction, string> = {
  confirm: "bg-navy-900 text-white",
  complete: "bg-emerald-600 text-white",
  reject: "bg-white text-red-700 border border-red-200",
  cancel: "bg-white text-red-700 border border-red-200",
  noShow: "bg-white text-slate-700 border border-slate-300",
};

const DONE_TEXT: Partial<Record<BookingAction, string>> = {
  confirm: "✅ Potvrđeno. Pošaljite kupcu potvrdu:",
  reject: "Zahtev je odbijen. Javite kupcu da izabere drugi termin:",
  cancel: "Termin je otkazan. Javite kupcu:",
};

/** While a card shows "send the message" the list must not refresh away from under it. */
function holdRefresh(on: boolean) {
  if (on) document.body.dataset.holdRefresh = "1";
  else delete document.body.dataset.holdRefresh;
}

export function BookingCard({ slug, booking: b }: { slug: string; booking: BookingCardData }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [after, setAfter] = useState<{ action: BookingAction; status: BookingStatus; messageUrl: string } | null>(null);
  const [confirming, setConfirming] = useState<BookingAction | null>(null);

  useEffect(() => () => holdRefresh(false), []);

  const status = after?.status ?? b.status;
  const isDestructive = (a: BookingAction) => a === "reject" || a === "cancel" || a === "noShow";

  function run(action: BookingAction) {
    if (isDestructive(action) && confirming !== action) {
      setConfirming(action);
      return;
    }
    setConfirming(null);
    startTransition(async () => {
      const r = await changeStatusAction({ slug, bookingId: b.id, action });
      if (!r.ok) {
        toast(r.reason === "not_allowed" ? "Status je u međuvremenu promenjen. Osvežavam…" : "Nije uspelo. Pokušajte ponovo.", "error");
        router.refresh();
        return;
      }
      if (r.messageUrl) {
        holdRefresh(true);
        setAfter({ action, status: r.status, messageUrl: r.messageUrl });
      } else {
        router.refresh();
      }
    });
  }

  function closeAfter() {
    holdRefresh(false);
    setAfter(null);
    router.refresh();
  }

  const chatUrl = whatsappLink(b.customerPhone, `Zdravo ${b.customerName}, `);

  return (
    <article className={`rounded-2xl bg-white p-4 shadow-sm ${status === "pending" ? "ring-2 ring-accent-400" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-bold tabular-nums">{b.timeRange}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {b.serviceName} · {vehicleTypeIcons[b.vehicleType]} {vehicleTypeLabels[b.vehicleType]}
            {b.bay !== null && <> · dizalica {b.bay}</>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="font-semibold">
          {b.customerName}
          {b.vehicleLabel && <span className="font-normal text-slate-600"> · {b.vehicleLabel}</span>}
          {b.byPhone && <span className="ml-1 text-xs font-normal text-slate-500">(upisano telefonom)</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a href={`tel:${b.customerPhone}`} className="font-medium text-navy-700 underline-offset-2 hover:underline">
            📞 {formatPhone(b.customerPhone)}
          </a>
          <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700">
            WhatsApp
          </a>
          <span className="ml-auto font-semibold tabular-nums">{formatRsd(b.priceRsd)}</span>
        </div>
        {b.customerNote && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">📝 {b.customerNote}</p>}
      </div>

      {after ? (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">{DONE_TEXT[after.action]}</p>
          <div className="mt-2 flex gap-2">
            <a
              href={after.messageUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setTimeout(closeAfter, 500)}
              className="flex-1 rounded-xl bg-[#25d366] px-4 py-3 text-center font-bold text-white active:scale-[0.98]"
            >
              📲 Pošalji na WhatsApp
            </a>
            <button type="button" onClick={closeAfter} className="rounded-xl px-3 py-3 text-sm font-medium text-slate-600">
              Preskoči
            </button>
          </div>
        </div>
      ) : (
        b.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {b.actions.map((a) => (
              <button
                key={a}
                type="button"
                disabled={pending}
                onClick={() => run(a)}
                className={`min-w-[7rem] flex-1 rounded-xl px-4 py-3 text-[15px] font-bold active:scale-[0.98] disabled:opacity-50 ${ACTION_STYLES[a]}`}
              >
                {confirming === a ? `Sigurno? ${ACTIONS[a].label}` : ACTIONS[a].label}
              </button>
            ))}
          </div>
        )
      )}
    </article>
  );
}
