import { getDb } from "@/db";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { ScheduleGrid, type GridColumn, type GridItem } from "@/components/admin/schedule-grid";
import { ScheduleNav } from "@/components/admin/schedule-nav";
import { addDays, dayChipLabel, dayColumnLabel, dayLongLabel, dayRangeLabel, hoursForDate, shopToday, utcToZoned } from "@/lib/availability";
import { hasFeature } from "@/lib/plan";
import { listDayBlocks, listDayBookings, toBookingCardData } from "@/server/admin";
import { getOrigin } from "@/server/origin";
import { getAdminBase, requireShopAccess } from "@/server/session";
import { loadShopContext } from "@/server/shops";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ datum?: string; prikaz?: string }> };

const MULTI_DAYS = 3;

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
  const { datum, prikaz } = await searchParams;
  const date = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : today;
  const view = prikaz === "3" ? "multi" : "day";
  const dates = view === "multi" ? Array.from({ length: MULTI_DAYS }, (_, i) => addDays(date, i)) : [date];

  const db = getDb();
  const [ctx, origin, base, days] = await Promise.all([
    loadShopContext(db, shop.slug),
    getOrigin(),
    getAdminBase(slug),
    Promise.all(dates.map(async (d) => ({ date: d, rows: await listDayBookings(db, shop, d), blocks: await listDayBlocks(db, shop, d) }))),
  ]);
  const nowLocal = utcToZoned(now, shop.timezone);
  const bayCount = Math.max(shop.bays, ...days.flatMap((d) => d.rows.map((b) => b.bay)));

  const perDay = days.map((d) => ({
    date: d.date,
    open: ctx ? hoursForDate(d.date, ctx.weeklyHours, ctx.exceptions) : [],
    blocks: d.blocks,
    items: d.rows.map((b) => {
      const start = utcToZoned(b.startsAt, shop.timezone);
      const end = utcToZoned(b.endsAt, shop.timezone);
      const card = toBookingCardData(b, shop, origin, now);
      return {
        bay: b.bay,
        fromMin: start.date < d.date ? 0 : start.minutes,
        toMin: end.date > d.date ? 24 * 60 : end.minutes,
        card,
      };
    }),
  }));

  const href = (d: string, v: "day" | "multi") => {
    const qs = new URLSearchParams();
    if (d !== today) qs.set("datum", d);
    if (v === "multi") qs.set("prikaz", "3");
    const s = qs.toString();
    return `${base}/raspored${s ? `?${s}` : ""}`;
  };

  let columns: GridColumn[];
  let title: string;
  if (view === "day") {
    const day = perDay[0]!;
    columns = Array.from({ length: bayCount }, (_, i) => i + 1).map((bay) => ({
      key: `bay-${bay}`,
      label: `Boks ${bay}`,
      lanes: 1,
      open: day.open,
      items: day.items.filter((it) => it.bay === bay).map((it): GridItem => ({ ...it, lane: 1, sheetLabel: `Boks ${bay}` })),
      blocks: day.blocks.filter((b) => b.bay === null || b.bay === bay).map((b) => ({ ...b, lane: null })),
      nowMin: day.date === today ? nowLocal.minutes : null,
    }));
    const chip = dayChipLabel(date, today);
    title = chip === "Danas" || chip === "Sutra" ? `${chip}, ${dayLongLabel(date)}` : dayLongLabel(date);
  } else {
    columns = perDay.map((day) => ({
      key: day.date,
      ...dayColumnLabel(day.date, today),
      href: href(day.date, "day"),
      highlight: day.date === today,
      lanes: bayCount,
      open: day.open,
      items: day.items.map(
        (it): GridItem => ({
          ...it,
          lane: it.bay,
          sheetLabel: bayCount > 1 ? `Boks ${it.bay} · ${dayLongLabel(day.date)}` : dayLongLabel(day.date),
        }),
      ),
      blocks: day.blocks.map((b) => ({ ...b, lane: b.bay })),
      nowMin: day.date === today ? nowLocal.minutes : null,
    }));
    title = dayRangeLabel(dates[0]!, dates[dates.length - 1]!);
  }

  // Opening hours, stretched to cover anything booked or blocked outside them, rounded out to whole hours.
  const edges = perDay.flatMap((d) => [
    ...d.open.flatMap((h) => [h.open, h.close]),
    ...d.items.flatMap((i) => [i.fromMin, i.toMin]),
    ...d.blocks.flatMap((b) => [b.fromMin, b.toMin]),
  ]);
  const startMin = edges.length ? Math.floor(Math.min(...edges) / 60) * 60 : 0;
  const endMin = edges.length ? Math.ceil(Math.max(...edges) / 60) * 60 : 0;

  const step = view === "multi" ? MULTI_DAYS : 1;
  const todayInView = dates.includes(today);

  return (
    <div className="flex flex-col gap-4">
      {todayInView && <AutoRefresh seconds={60} />}

      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Raspored</h1>
        <p className="text-sm text-slate-600">
          {view === "day"
            ? "Ko je kada u kom boksu. Dodirnite termin za detalje i akcije."
            : bayCount > 1
              ? "Tri dana, svaki boks je jedna traka u danu. Dodirnite dan za detalje."
              : "Tri dana odjednom. Dodirnite dan za detalje ili termin za akcije."}
        </p>
      </div>

      <ScheduleNav
        routeKey={`${date}|${view}`}
        view={view}
        dayViewHref={href(todayInView ? today : date, "day")}
        multiViewHref={href(date, "multi")}
        title={title}
        prevHref={href(addDays(date, -step), view)}
        nextHref={href(addDays(date, step), view)}
        todayHref={todayInView ? null : href(today, view)}
        stepLabel={view === "multi" ? "3 dana" : "dan"}
      >
        {endMin === startMin ? (
          <div className="rounded-2xl border-2 border-navy-900 bg-white p-6 text-center text-slate-600">
            <p className="text-3xl" aria-hidden>
              🔒
            </p>
            <p className="mt-2 font-semibold">{view === "day" ? "Zatvoreno, nema termina." : "Zatvoreno sva tri dana, nema termina."}</p>
          </div>
        ) : (
          <ScheduleGrid slug={slug} startMin={startMin} endMin={endMin} columns={columns} />
        )}
      </ScheduleNav>
    </div>
  );
}
