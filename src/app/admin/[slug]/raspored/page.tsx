import Link from "next/link";
import { getDb } from "@/db";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { DaySchedule, type ScheduleItem } from "@/components/admin/day-schedule";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { addDays, dayChipLabel, dayLongLabel, hoursForDate, shopToday, utcToZoned } from "@/lib/availability";
import { hasFeature } from "@/lib/plan";
import { listDayBlocks, listDayBookings, toBookingCardData } from "@/server/admin";
import { getOrigin } from "@/server/origin";
import { getAdminBase, requireShopAccess } from "@/server/session";
import { loadShopContext } from "@/server/shops";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ datum?: string }> };

export default async function SchedulePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { shop } = await requireShopAccess(slug);

  if (!hasFeature(shop.plan, "raspored")) {
    return (
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="font-mono text-xl font-bold">Raspored</h1>
        </div>
        <PlanUpgradeNotice feature="Raspored" />
      </div>
    );
  }

  const now = new Date();
  const today = shopToday(shop, now);
  const { datum } = await searchParams;
  const date = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : today;

  const db = getDb();
  const [ctx, rows, blocks, origin, base] = await Promise.all([
    loadShopContext(db, shop.slug),
    listDayBookings(db, shop, date),
    listDayBlocks(db, shop, date),
    getOrigin(),
    getAdminBase(slug),
  ]);

  const hours = ctx ? hoursForDate(date, ctx.weeklyHours, ctx.exceptions) : [];
  const items: ScheduleItem[] = rows.map((b) => {
    const start = utcToZoned(b.startsAt, shop.timezone);
    const end = utcToZoned(b.endsAt, shop.timezone);
    return {
      bay: b.bay,
      fromMin: start.date < date ? 0 : start.minutes,
      toMin: end.date > date ? 24 * 60 : end.minutes,
      card: toBookingCardData(b, shop, origin, now),
    };
  });

  // Opening hours, stretched to cover anything booked or blocked outside them, rounded out to whole hours.
  const edges = [...hours.flatMap((h) => [h.open, h.close]), ...items.flatMap((i) => [i.fromMin, i.toMin]), ...blocks.flatMap((b) => [b.fromMin, b.toMin])];
  const startMin = edges.length ? Math.floor(Math.min(...edges) / 60) * 60 : 0;
  const endMin = edges.length ? Math.ceil(Math.max(...edges) / 60) * 60 : 0;
  const nowLocal = utcToZoned(now, shop.timezone);

  const href = (d: string) => (d === today ? `${base}/raspored` : `${base}/raspored?datum=${d}`);
  const chip = dayChipLabel(date, today);
  const title = chip === "Danas" || chip === "Sutra" ? `${chip}, ${dayLongLabel(date)}` : dayLongLabel(date);

  return (
    <div className="flex flex-col gap-4">
      {date === today && <AutoRefresh seconds={60} />}

      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Raspored</h1>
        <p className="text-sm text-slate-600">Ko je kada u kom boksu. Dodirnite termin za detalje i akcije.</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border-2 border-navy-900 bg-white p-1">
        <Link href={href(addDays(date, -1))} aria-label="Prethodni dan" className="grid size-10 place-items-center rounded-lg text-xl font-bold">
          ‹
        </Link>
        <p className="flex-1 text-center font-semibold">{title}</p>
        <Link href={href(addDays(date, 1))} aria-label="Sledeći dan" className="grid size-10 place-items-center rounded-lg text-xl font-bold">
          ›
        </Link>
      </div>
      {date !== today && (
        <Link href={href(today)} className="-mt-2 self-center text-sm font-semibold text-navy-700 underline">
          Nazad na danas
        </Link>
      )}

      {endMin === startMin ? (
        <div className="rounded-2xl border-2 border-navy-900 bg-white p-6 text-center text-slate-600">
          <p className="text-3xl" aria-hidden>
            🔒
          </p>
          <p className="mt-2 font-semibold">Zatvoreno, nema termina.</p>
        </div>
      ) : (
        <DaySchedule
          slug={slug}
          bays={shop.bays}
          startMin={startMin}
          endMin={endMin}
          items={items}
          blocks={blocks}
          nowMin={date === today ? nowLocal.minutes : null}
        />
      )}
    </div>
  );
}
