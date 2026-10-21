/** Texts sent over WhatsApp/Viber about a booking. Plain strings, no emoji-only lines. */
import { formatRsd } from "../availability/labels.ts";
import { formatPhone } from "../phone.ts";

export interface BookingSummary {
  shopName: string;
  serviceName: string;
  vehicleTypeLabel: string;
  dayLabel: string; // "petak 23.10."
  time: string; // "08:30"
  priceRsd: number;
  customerName: string;
  customerPhone: string; // E.164
  vehicleLabel?: string;
  note?: string;
}

/** Message the customer can forward to the shop ("Javi radnji na WhatsApp"). */
export function newBookingMessage(b: BookingSummary): string {
  return [
    `🛞 NOVI TERMIN – ${b.shopName}`,
    `🔄 ${b.serviceName}`,
    `🚗 ${b.vehicleTypeLabel}${b.vehicleLabel ? ` · ${b.vehicleLabel}` : ""}`,
    `📅 ${b.dayLabel} u ${b.time}h`,
    `💰 ${formatRsd(b.priceRsd)}`,
    `👤 ${b.customerName} · 📞 ${formatPhone(b.customerPhone)}`,
    ...(b.note ? [`📝 ${b.note}`] : []),
  ].join("\n");
}

export interface CustomerMessageInput {
  shopName: string;
  serviceName: string;
  dayLabel: string; // "petak 23.10."
  time: string; // "08:30"
  priceRsd: number;
  address?: string | null;
  /** Public booking page, for picking another slot */
  bookingUrl: string;
  /** Self-service cancel link, shown only in the confirmation message */
  cancelUrl?: string;
}

/** Shop → customer after "Potvrdi". */
export function confirmationMessage(m: CustomerMessageInput): string {
  return [
    `✅ ${m.shopName}: potvrđen termin`,
    `${m.serviceName}, ${m.dayLabel} u ${m.time}h.`,
    `Cena: ${formatRsd(m.priceRsd)}.`,
    ...(m.address ? [`Adresa: ${m.address}`] : []),
    m.cancelUrl ? `Ako ne možete da dođete, otkažite ovde: ${m.cancelUrl}` : "Ako ne možete da dođete, javite nam. Vidimo se!",
  ].join("\n");
}

/** Shop → customer after "Odbij": the slot can't be done, pick another. */
export function rejectionMessage(m: CustomerMessageInput): string {
  return [
    `${m.shopName}: nažalost, termin ${m.dayLabel} u ${m.time}h ne možemo da primimo.`,
    `Izaberite drugi termin ovde: ${m.bookingUrl}`,
    "Izvinite zbog neprijatnosti.",
  ].join("\n");
}

/** Shop → customer after "Otkaži" on a confirmed booking. */
export function cancellationMessage(m: CustomerMessageInput): string {
  return [
    `${m.shopName}: moramo da otkažemo vaš termin ${m.dayLabel} u ${m.time}h.`,
    `Izaberite novi termin ovde: ${m.bookingUrl}`,
    "Izvinite zbog neprijatnosti.",
  ].join("\n");
}

/** Default starting point for a reminder campaign's editable message template. */
export const DEFAULT_REMINDER_TEMPLATE = "Zdravo {ime}! Vreme je za zamenu guma u {radnja}. Zakažite termin: {link}";

/** Fills a reminder campaign's template — {ime}, {link}, {radnja} — with no vehicle mention (a customer may have more than one). */
export function reminderMessage(template: string, v: { ime: string; link: string; radnja: string }): string {
  return template.replace(/\{ime\}/g, v.ime).replace(/\{link\}/g, v.link).replace(/\{radnja\}/g, v.radnja);
}
