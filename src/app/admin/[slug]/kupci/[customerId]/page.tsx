import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { BookingCard, type BookingCardData } from "@/components/admin/booking-card";
import { dayLongLabel, utcToZoned } from "@/lib/availability";
import { formatMinutes } from "@/lib/availability/zoned";
import { allowedActions } from "@/lib/booking/status";
import { customerMessageUrl, listCustomerBookings, notifyKindForStatus } from "@/server/admin";
import { getShopCustomer } from "@/server/customers";
import { getOrigin } from "@/server/origin";
import { getAdminBase, requireShopAccess } from "@/server/session";

export default async function CustomerHistoryPage({ params }: { params: Promise<{ slug: string; customerId: string }> }) {
  const { slug, customerId } = await params;
  const { shop } = await requireShopAccess(slug);
  const db = getDb();
  const [customer, rows, origin, base] = await Promise.all([
    getShopCustomer(db, shop.id, customerId),
    listCustomerBookings(db, shop.id, customerId),
    getOrigin(),
    getAdminBase(slug),
  ]);
  if (!customer) notFound();

  const now = new Date();
  const groups = new Map<string, BookingCardData[]>();
  for (const b of rows) {
    const start = utcToZoned(b.startsAt, shop.timezone);
    const end = utcToZoned(b.endsAt, shop.timezone);
    const notifyKind = b.notifiedAt === null ? notifyKindForStatus(b.status) : null;
    const card: BookingCardData = {
      id: b.id,
      status: b.status,
      actions: allowedActions(b.status, b.startsAt, now),
      timeRange: `${formatMinutes(start.minutes)}–${formatMinutes(end.minutes)}`,
      serviceName: `${b.serviceIcon ?? ""} ${b.serviceName}`.trim(),
      vehicleTypeLabel: b.vehicleTypeLabel,
      vehicleTypeIcon: b.vehicleTypeIcon,
      vehicleLabel: b.vehicleLabel,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      customerNote: b.customerNote,
      priceRsd: b.priceRsd,
      bay: shop.bays > 1 ? b.bay : null,
      byPhone: b.source === "admin",
      cancelReason: b.cancelReason,
      notifyUrl: notifyKind ? customerMessageUrl(b, shop, notifyKind, origin) : null,
    };
    const list = groups.get(start.date) ?? [];
    list.push(card);
    groups.set(start.date, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`${base}/kupci`} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700">
        <span aria-hidden>‹</span> Kupci
      </Link>
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">{customer.name}</h1>
        <p className="text-sm text-slate-600">{customer.phone}</p>
        {customer.notes && <p className="mt-1 text-sm text-slate-500">{customer.notes}</p>}
      </div>

      {groups.size === 0 ? (
        <p className="px-1 text-sm text-slate-500">Nema zabeleženih termina.</p>
      ) : (
        [...groups].map(([date, cards]) => (
          <section key={date} aria-label={dayLongLabel(date)}>
            <h2 className="mb-2 px-1 font-mono text-sm font-bold tracking-wide text-slate-500 uppercase">{dayLongLabel(date)}</h2>
            <div className="flex flex-col gap-3">
              {cards.map((c) => (
                <BookingCard key={c.id} slug={slug} booking={c} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
