import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BookingChat, type ChatShop } from "@/components/booking/booking-chat";
import { getDb } from "@/db";
import { getOpenStatus, openStatusText, shopToday } from "@/lib/availability";
import { loadShopContext } from "@/server/shops";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const ctx = await loadShopContext(getDb(), slug);
  if (!ctx) return { title: "Radnja nije pronađena" };
  return {
    title: `Zakažite termin · ${ctx.shop.name}`,
    description: `Zakažite zamenu guma u radnji ${ctx.shop.name}${ctx.shop.city ? `, ${ctx.shop.city}` : ""} bez zvanja i čekanja.`,
  };
}

export default async function ShopBookingPage({ params }: Props) {
  // Always render per request: open status and free slots change by the minute.
  await connection();
  const { slug } = await params;
  const ctx = await loadShopContext(getDb(), slug);
  if (!ctx) notFound();

  const now = new Date();
  const status = getOpenStatus({ shop: ctx.settings, weeklyHours: ctx.weeklyHours, exceptions: ctx.exceptions, now });

  const shop: ChatShop = {
    slug: ctx.shop.slug,
    name: ctx.shop.name,
    city: ctx.shop.city,
    address: ctx.shop.address,
    phone: ctx.shop.phone,
    open: status.open,
    statusText: openStatusText(status, shopToday(ctx.settings, now)),
    services: ctx.services,
  };

  return <BookingChat shop={shop} />;
}
