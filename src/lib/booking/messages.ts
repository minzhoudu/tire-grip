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

export const vehicleTypeLabels = { car: "Putničko", suv: "SUV / džip", van: "Kombi" } as const;
export const vehicleTypeIcons = { car: "🚗", suv: "🚙", van: "🚐" } as const;
