"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeStatusAction, markNotifiedAction, type BookingCustomerView } from "@/app/admin/[slug]/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { sendReminder, useSentReminders } from "./reminder-store";
import { AddCustomerDetails } from "./add-customer-details";
import { SupportDeleteButton } from "./support-delete-button";
import { useSupportMode } from "./support-mode";
import { useToast } from "@/components/ui/toast";
import { formatRsd } from "@/lib/availability/labels";
import { ACTIONS, CUSTOMER_CANCEL_REASON, STATUS_LABELS, type BookingAction, type BookingStatus } from "@/lib/booking/status";
import { formatPhone, whatsappLink } from "@/lib/phone";

export interface BookingCardData {
  id: string;
  status: BookingStatus;
  actions: BookingAction[];
  timeRange: string;
  serviceName: string;
  vehicleTypeLabel: string;
  vehicleTypeIcon: string | null;
  vehicleLabel: string | null;
  customerName: string;
  /** null for a Rezervacija radnje (entered by the shop without the customer's data) */
  customerPhone: string | null;
  isShopEntry: boolean;
  customerNote: string | null;
  priceRsd: number;
  /** Shown only when the shop has more than one bay */
  bay: number | null;
  byPhone: boolean;
  cancelReason: string | null;
  /** Set (and the "message not sent" banner shown) whenever the customer hasn't been told about the booking's current status yet — persists across visits, not just right after the action. */
  notifyUrl: string | null;
  /** Earlier "nije došao" bookings by this customer at this shop */
  customerNoShows: number;
  /** Confirmed and tomorrow: the card's WhatsApp sends the day-before reminder (shared with the "Podsetnici za sutra" card). */
  reminder?: { url: string; sent: boolean };
}

const STATUS_STYLES: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-500 line-through",
  rejected: "bg-slate-200 text-slate-500 line-through",
  no_show: "bg-red-100 text-red-800",
};

/** Cancelled by the customer (via the self-service link) stands out from a shop-initiated cancel. */
const CANCELLED_BY_CUSTOMER_STYLE = "bg-red-100 text-red-800 line-through";

const ACTION_STYLES: Record<BookingAction, string> = {
  confirm: "bg-navy-900 text-white",
  complete: "bg-emerald-600 text-white",
  reject: "bg-white text-red-700 border border-red-200",
  cancel: "bg-white text-red-700 border border-red-200",
  noShow: "bg-white text-slate-700 border border-slate-300",
};

/** Keyed by the booking's current status, since that's all we know when re-showing this banner on a later visit. */
const NOTIFY_TEXT: Partial<Record<BookingStatus, string>> = {
  confirmed: "Potvrđeno, ali kupac još nije obavešten.",
  rejected: "Zahtev je odbijen, ali kupac još nije obavešten.",
  cancelled: "Termin je otkazan, ali kupac još nije obavešten.",
};

export function BookingCard({ slug, booking: b }: { slug: string; booking: BookingCardData }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<BookingAction | null>(null);
  const [running, setRunning] = useState<BookingAction | null>(null);
  const [status, setStatus] = useState(b.status);
  const [actions, setActions] = useState(b.actions);
  const [notifyUrl, setNotifyUrl] = useState(b.notifyUrl);
  const sentHere = useSentReminders();
  const supportMode = useSupportMode();
  // Details added with "Upiši podatke kupca" show right away, without waiting for the list to reload.
  const [savedCustomer, setSavedCustomer] = useState<BookingCustomerView | null>(null);
  const customer: BookingCustomerView = savedCustomer ?? {
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    vehicleLabel: b.vehicleLabel,
    isShopEntry: b.isShopEntry,
  };
  const [deleted, setDeleted] = useState(false);
  const reminderDue = b.reminder && status === "confirmed" && !sentHere(b.id, b.reminder.sent);

  const isDestructive = (a: BookingAction) => a === "reject" || a === "cancel" || a === "noShow";

  function run(action: BookingAction) {
    if (isDestructive(action) && confirming !== action) {
      setConfirming(action);
      return;
    }
    setConfirming(null);
    setRunning(action);
    startTransition(async () => {
      const r = await changeStatusAction({ slug, bookingId: b.id, action });
      if (!r.ok) {
        toast(r.reason === "not_allowed" ? "Status je u međuvremenu promenjen. Osvežavam…" : "Nije uspelo. Pokušajte ponovo.", "error");
        router.refresh();
        return;
      }
      setStatus(r.status);
      setActions(r.actions);
      setNotifyUrl(r.messageUrl);
    });
  }

  function sendNotify() {
    setNotifyUrl(null);
    void markNotifiedAction({ slug, bookingId: b.id });
  }

  const chatUrl = customer.customerPhone ? whatsappLink(customer.customerPhone, `Zdravo ${customer.customerName}, `) : null;
  const cancelledByCustomer = status === "cancelled" && b.cancelReason === CUSTOMER_CANCEL_REASON;

  if (deleted) {
    return <p className="rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">🗑️ Termin je obrisan iz baze.</p>;
  }

  return (
    <article
      id={`booking-${b.id}`}
      className={`scroll-mt-32 rounded-2xl border-2 border-navy-900 bg-white p-4 target:ring-4 target:ring-accent-500 ${
        status === "pending" ? "ring-2 ring-accent-400" : cancelledByCustomer ? "ring-2 ring-red-400" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xl font-bold tabular-nums">{b.timeRange}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {b.serviceName} · {b.vehicleTypeIcon} {b.vehicleTypeLabel}
            {b.bay !== null && <> · boks {b.bay}</>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${cancelledByCustomer ? CANCELLED_BY_CUSTOMER_STYLE : STATUS_STYLES[status]}`}>
          {cancelledByCustomer ? "Otkazao kupac" : STATUS_LABELS[status]}
        </span>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="font-semibold">
          {customer.customerName}
          {customer.vehicleLabel && <span className="font-normal text-slate-600"> · {customer.vehicleLabel}</span>}
          {customer.isShopEntry ? (
            <span className="ml-1 text-xs font-normal text-slate-500">(upisala radnja, bez broja)</span>
          ) : (
            b.byPhone && <span className="ml-1 text-xs font-normal text-slate-500">(upisano telefonom)</span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {!customer.customerPhone || !chatUrl ? (
            <AddCustomerDetails slug={slug} bookingId={b.id} onSaved={setSavedCustomer} />
          ) : (
          <>
          <a href={`tel:${customer.customerPhone}`} className="font-medium text-navy-700 underline-offset-2 hover:underline">
            📞 {formatPhone(customer.customerPhone)}
          </a>
          {reminderDue ? (
            <a
              href={b.reminder!.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => sendReminder(slug, b.id)}
              className="rounded-full bg-[#25d366] px-3 py-1 font-semibold text-white active:scale-[0.98]"
            >
              🔔 Pošalji podsetnik
            </a>
          ) : (
            <>
              <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700">
                WhatsApp
              </a>
              {b.reminder && status === "confirmed" && <span className="text-xs font-semibold text-emerald-700">Podsetnik poslat ✓</span>}
            </>
          )}
          </>
          )}
          <span className="ml-auto font-mono font-bold tabular-nums text-rust-600">{formatRsd(b.priceRsd)}</span>
        </div>
        {cancelledByCustomer && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">❌ Kupac je otkazao ovaj termin.</p>
        )}
        {b.customerNoShows > 0 && (status === "pending" || status === "confirmed") && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            ⚠️ Ovaj kupac {b.customerNoShows === 1 ? "jednom nije došao" : `${b.customerNoShows} puta nije došao`} na zakazan termin. Možda ga
            pozovite da potvrdi.
          </p>
        )}
        {b.customerNote && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">📝 {b.customerNote}</p>}
      </div>

      {notifyUrl && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">⚠️ {NOTIFY_TEXT[status] ?? "Poruka kupcu nije poslata."}</p>
          <a
            href={notifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={sendNotify}
            className="mt-2 block rounded-xl bg-[#25d366] px-4 py-3 text-center font-bold text-white active:scale-[0.98]"
          >
            📲 Pošalji na WhatsApp
          </a>
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              disabled={pending}
              onClick={() => run(a)}
              className={`flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-[15px] font-bold active:scale-[0.98] ${
                pending && running === a ? "" : "disabled:opacity-50"
              } ${ACTION_STYLES[a]}`}
            >
              {pending && running === a ? (
                <>
                  <InlineSpinner />
                  Čuvam…
                </>
              ) : confirming === a ? (
                `Sigurno? ${ACTIONS[a].label}`
              ) : (
                ACTIONS[a].label
              )}
            </button>
          ))}
        </div>
      )}

      {supportMode && <SupportDeleteButton slug={slug} bookingId={b.id} onDeleted={() => setDeleted(true)} />}
    </article>
  );
}
