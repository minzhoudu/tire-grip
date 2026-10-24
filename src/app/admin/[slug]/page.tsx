import { getDb } from "@/db";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { BookingCard, type BookingCardData } from "@/components/admin/booking-card";
import { RequestViewTabs } from "@/components/admin/request-view-tabs";
import { SetupChecklistCard } from "@/components/admin/setup-checklist";
import { TomorrowReminders, type ReminderItem } from "@/components/admin/tomorrow-reminders";
import { PendingArea, PendingNavProvider } from "@/components/ui/pending-nav";
import { addDays, dayChipLabel, dayLongLabel, shopToday, utcToZoned } from "@/lib/availability";
import { formatMinutes } from "@/lib/availability/zoned";
import { customerMessageUrl, listBookings, toBookingCardData, type AdminView } from "@/server/admin";
import { getOrigin } from "@/server/origin";
import { getSetupChecklist } from "@/server/settings";
import { getAdminBase, requireShopAccess } from "@/server/session";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> };

export default async function RequestsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { view: rawView } = await searchParams;
  const view: AdminView = rawView === "history" ? "history" : "upcoming";
  const { shop, role } = await requireShopAccess(slug);

  const now = new Date();
  const today = shopToday(shop, now);
  const rows = await listBookings(getDb(), shop, view, now);
  const [origin, base, checklist] = await Promise.all([
    getOrigin(),
    getAdminBase(slug),
    role === "owner" ? getSetupChecklist(getDb(), shop.id) : Promise.resolve(null),
  ]);

  // Group by local day, keeping the query's order.
  const tomorrow = addDays(today, 1);
  const reminders: ReminderItem[] = [];
  const groups = new Map<string, BookingCardData[]>();
  for (const b of rows) {
    const start = utcToZoned(b.startsAt, shop.timezone);
    if (view === "upcoming" && b.status === "confirmed" && start.date === tomorrow) {
      reminders.push({
        id: b.id,
        time: formatMinutes(start.minutes),
        customerName: b.customerName,
        serviceName: `${b.serviceIcon ?? ""} ${b.serviceName}`.trim(),
        url: customerMessageUrl(b, shop, "reminder", origin),
        sent: b.reminderSentAt !== null,
      });
    }
    const list = groups.get(start.date) ?? [];
    list.push(toBookingCardData(b, shop, origin, now));
    groups.set(start.date, list);
  }

  const upcomingHref = base;
  const historyHref = `${base}?view=history`;

  const heading = (date: string) => {
    const chip = dayChipLabel(date, today);
    return chip === "Danas" || chip === "Sutra" ? `${chip} · ${dayLongLabel(date)}` : dayLongLabel(date);
  };

  return (
    <div className="flex flex-col gap-4">
      {view === "upcoming" && <AutoRefresh seconds={30} />}

      {view === "upcoming" && checklist && <SetupChecklistCard checklist={checklist} base={base} />}

      {reminders.length > 0 && <TomorrowReminders slug={slug} dayLabel={dayLongLabel(tomorrow)} items={reminders} />}

      {/* The tabs prefetch the other view, so switching is instant (and then quietly refreshed). */}
      <PendingNavProvider routeKey={view}>
        <RequestViewTabs view={view} upcomingHref={upcomingHref} historyHref={historyHref} />

        <PendingArea>
          <div className="flex flex-col gap-4">
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
        </PendingArea>
      </PendingNavProvider>
    </div>
  );
}
