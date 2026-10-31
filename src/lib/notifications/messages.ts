/**
 * Texts of the notifications a shop gets (push + fallback email) when a
 * customer books or cancels on their own. Pure, so they're unit-tested.
 */
import { dayChipLabel, formatRsd } from "../availability/labels.ts";

export type ShopEventKind = "new_booking" | "customer_cancelled";

export interface ShopEventDetails {
  kind: ShopEventKind;
  bookingId: string;
  /** Status right after the event: "pending" (waits for the shop), "confirmed" (auto-confirm) or "cancelled". */
  status: string;
  shopName: string;
  customerName: string;
  serviceName: string;
  serviceIcon: string | null;
  vehicleLabel: string | null;
  priceRsd: number;
  /** Local date and time in the shop's timezone */
  date: string;
  time: string;
  /** Today in the shop's timezone, for "Danas" / "Sutra" */
  today: string;
}

export interface ShopNotification {
  title: string;
  body: string;
  /** Same tag = a newer notification replaces the older one for that booking instead of stacking. */
  tag: string;
}

export function shopNotification(e: ShopEventDetails): ShopNotification {
  const when = `${dayChipLabel(e.date, e.today)} u ${e.time}h`;
  const service = `${e.serviceIcon ? `${e.serviceIcon} ` : ""}${e.serviceName}`;
  const vehicle = e.vehicleLabel ? ` · ${e.vehicleLabel}` : "";
  const tag = `booking-${e.bookingId}`;

  if (e.kind === "customer_cancelled") {
    return { title: `❌ Otkazan termin: ${e.customerName}`, body: `${service}, ${when}${vehicle}. Termin je ponovo slobodan.`, tag };
  }
  if (e.status === "confirmed") {
    return { title: `✅ Nova rezervacija: ${e.customerName}`, body: `${service}, ${when}${vehicle}. Automatski potvrđeno.`, tag };
  }
  return { title: `🛞 Novi zahtev: ${e.customerName}`, body: `${service}, ${when}${vehicle}. Čeka vašu potvrdu.`, tag };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Email fallback for members without push: same text, plus price and a button to the panel. */
export function shopNotificationEmail(e: ShopEventDetails, adminUrl: string): { subject: string; html: string } {
  const n = shopNotification(e);
  const button = e.kind === "new_booking" && e.status === "pending" ? "Otvori zahteve" : "Otvori panel";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
  <p style="font-family:monospace;font-size:20px;font-weight:bold;color:#0a1a33;margin:0 0 20px">🛞 ${escapeHtml(e.shopName)}</p>
  <h1 style="font-size:18px;color:#0a1a33;margin:0 0 12px">${escapeHtml(n.title)}</h1>
  <p style="color:#334155;font-size:14px;margin:0 0 4px">${escapeHtml(n.body)}</p>
  <p style="color:#334155;font-size:14px;margin:0">Cena: ${escapeHtml(formatRsd(e.priceRsd))}</p>
  <a href="${escapeHtml(adminUrl)}" style="display:inline-block;margin:16px 0;padding:12px 20px;background:#f5b700;color:#0a1a33;font-weight:bold;text-decoration:none;border-radius:10px;border:2px solid #0a1a33">${button}</a>
  <p style="font-size:12px;color:#94a3b8;margin-top:32px">Ovaj email dobijate jer na telefonu niste uključili obaveštenja. Uključite ih u panelu → Obaveštenja, ili tamo isključite email.</p>
</div>`;
  return { subject: `${n.title} | Moj Vulkanizer`, html };
}
