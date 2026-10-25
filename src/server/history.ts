/**
 * Istorija on the Zahtevi page: one page of past bookings ready for the cards. Used by the page
 * (first page) and by loadHistoryAction ("Učitaj još"). Not a server action: the caller passes a
 * shop it already got from requireShopAccess.
 */
import type { BookingCardData } from "../components/admin/booking-card.tsx";
import { getDb } from "../db/index.ts";
import { shopToday, utcToZoned } from "../lib/availability/index.ts";
import { dayHeading, listHistoryPage, toBookingCardData, type HistoryCursor } from "./admin.ts";
import { getOrigin } from "./origin.ts";

export interface HistoryItem {
  date: string;
  heading: string;
  card: BookingCardData;
}

export type HistoryPage = { items: HistoryItem[]; next: HistoryCursor | null };

export async function historyPage(shop: Parameters<typeof toBookingCardData>[1] & { id: string; timezone: string }, cursor?: HistoryCursor): Promise<HistoryPage> {
  const now = new Date();
  const today = shopToday(shop, now);
  const [{ rows, next }, origin] = await Promise.all([listHistoryPage(getDb(), shop, { cursor, now }), getOrigin()]);
  return {
    items: rows.map((b) => {
      const date = utcToZoned(b.startsAt, shop.timezone).date;
      return { date, heading: dayHeading(date, today), card: toBookingCardData(b, shop, origin, now) };
    }),
    next,
  };
}
