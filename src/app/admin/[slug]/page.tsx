import Link from "next/link";
import { getDb } from "@/db";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { BookingCard, type BookingCardData } from "@/components/admin/booking-card";
import { dayChipLabel, dayLongLabel, shopToday, utcToZoned } from "@/lib/availability";
import { formatMinutes } from "@/lib/availability/zoned";
import { allowedActions } from "@/lib/booking/status";
import { listBookings, type AdminView } from "@/server/admin";
import { requireShopAccess } from "@/server/session";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> };

export default async function RequestsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { view: rawView } = await searchParams;
  const view: AdminView = rawView === "history" ? "history" : "upcoming";
  const { shop } = await requireShopAccess(slug);

  const now = new Date();
  const today = shopToday(shop, now);
  const rows = await listBookings(getDb(), shop, view, now);

  // Group by local day, keeping the query's order.
  const groups = new Map<string, BookingCardData[]>();
  for (const b of rows) {
    const start = utcToZoned(b.startsAt, shop.timezone);
    const end = utcToZoned(b.endsAt, shop.timezone);
    const card: BookingCardData = {
      id: b.id,
      status: b.status,
      actions: allowedActions(b.status, b.startsAt, now),
      timeRange: `${formatMinutes(start.minutes)}–${formatMinutes(end.minutes)}`,
      serviceName: `${b.serviceIcon ?? ""} ${b.serviceName}`.trim(),
      vehicleType: b.vehicleType,
      vehicleLabel: b.vehicleLabel,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      customerNote: b.customerNote,
      priceRsd: b.priceRsd,
      bay: shop.bays > 1 ? b.bay : null,
      byPhone: b.source === "admin",
    };
    const list = groups.get(start.date) ?? [];
    list.push(card);
    groups.set(start.date, list);
  }

  const heading = (date: string) => {
    const chip = dayChipLabel(date, today);
    return chip === "Danas" || chip === "Sutra" ? `${chip} · ${dayLongLabel(date)}` : dayLongLabel(date);
  };

  return (
    <div className="flex flex-col gap-4">
      {view === "upcoming" && <AutoRefresh seconds={30} />}

      <div className="flex rounded-xl border-2 border-navy-900 bg-white p-1 text-sm font-semibold">
        {(
          [
            ["upcoming", "Predstojeći"],
            ["history", "Istorija"],
          ] as const
        ).map(([v, label]) => (
          <Link
            key={v}
            href={v === "upcoming" ? `/admin/${slug}` : `/admin/${slug}?view=${v}`}
            className={`flex-1 rounded-lg py-2 text-center ${view === v ? "bg-navy-900 text-white" : "text-slate-600"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {groups.size === 0 && (
        <div className="rounded-2xl border-2 border-navy-900 bg-white p-6 text-center text-slate-600">
          {view === "upcoming" ? (
            <>
              <p className="text-3xl" aria-hidden>
                📭
              </p>
              <p className="mt-2 font-semibold">Nema zakazanih termina.</p>
              <p className="mt-1 text-sm">Novi zahtevi se ovde pojavljuju sami, bez osvežavanja.</p>
            </>
          ) : (
            <p>Nema ranijih termina u poslednjih 60 dana.</p>
          )}
        </div>
      )}

      {[...groups].map(([date, cards]) => (
        <section key={date} aria-label={heading(date)}>
          <h2 className="mb-2 px-1 font-mono text-sm font-bold tracking-wide text-slate-500 uppercase">{heading(date)}</h2>
          <div className="flex flex-col gap-3">
            {cards.map((c) => (
              <BookingCard key={c.id} slug={slug} booking={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
