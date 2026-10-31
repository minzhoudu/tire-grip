import { getDb } from "@/db";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { BookingCard, type BookingCardData } from "@/components/admin/booking-card";
import { EnablePushPrompt } from "@/components/admin/push/enable-push-prompt";
import { HistoryList } from "@/components/admin/history-list";
import { PastBookingsToClose, type PastBookingItem } from "@/components/admin/past-bookings-to-close";
import { historyPage } from "@/server/history";
import { RequestViewTabs } from "@/components/admin/request-view-tabs";
import { SetupChecklistCard } from "@/components/admin/setup-checklist";
import { TomorrowReminders, type ReminderItem } from "@/components/admin/tomorrow-reminders";
import { PendingArea, PendingNavProvider } from "@/components/ui/pending-nav";
import { addDays, dayChipLabel, dayLongLabel, shopToday, utcToZoned } from "@/lib/availability";
import { formatMinutes } from "@/lib/availability/zoned";
import {
  AUTO_COMPLETE_AFTER_DAYS,
  autoCompleteStale,
  customerMessageUrl,
  dayHeading,
  listBookings,
  listBookingsToClose,
  toBookingCardData,
  type AdminView,
} from "@/server/admin";
import { getOrigin } from "@/server/origin";
import { getSetupChecklist } from "@/server/settings";
import { getAdminBase, requireShopAccess } from "@/server/session";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> };

export default async function RequestsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { view: rawView } = await searchParams;
  const view: AdminView = rawView === "history" ? "history" : "upcoming";
  const { shop, role, isImpersonating } = await requireShopAccess(slug);

  const now = new Date();
  const today = shopToday(shop, now);
  const db = getDb();
  await autoCompleteStale(db, shop.id, now);
  const [rows, toClose, history] = await Promise.all([
    view === "upcoming" ? listBookings(db, shop, "upcoming", now) : Promise.resolve([]),
    view === "upcoming" ? listBookingsToClose(db, shop.id, now) : Promise.resolve([]),
    view === "history" ? historyPage(shop) : Promise.resolve(null),
  ]);
  const yesterday = addDays(today, -1);
  const pastItems: PastBookingItem[] = toClose.map((b) => {
    const start = utcToZoned(b.startsAt, shop.timezone);
    return {
      id: b.id,
      dayLabel: start.date === today ? "Danas" : start.date === yesterday ? "Juče" : dayChipLabel(start.date, today),
      time: formatMinutes(start.minutes),
      customerName: b.customerName,
      serviceName: `${b.serviceIcon ?? ""} ${b.serviceName}`.trim(),
      bay: shop.bays > 1 ? b.bay : null,
    };
  });
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
    // Booked today for tomorrow: the customer just arranged it, a reminder would be noise.
    const bookedToday = utcToZoned(b.createdAt, shop.timezone).date === today;
    if (view === "upcoming" && b.status === "confirmed" && start.date === tomorrow && !bookedToday) {
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
    const card = toBookingCardData(b, shop, origin, now);
    const reminder = reminders.find((r) => r.id === b.id);
    list.push(reminder ? { ...card, reminder: { url: reminder.url, sent: reminder.sent } } : card);
    groups.set(start.date, list);
  }

  const upcomingHref = base;
  const historyHref = `${base}?view=history`;

  const heading = (date: string) => dayHeading(date, today);

  return (
    <div className="flex flex-col gap-4">
      {view === "upcoming" && <AutoRefresh seconds={30} />}

      {view === "upcoming" && checklist && <SetupChecklistCard checklist={checklist} base={base} />}

      {view === "upcoming" && !isImpersonating && <EnablePushPrompt href={`${base}/obavestenja`} />}

      {pastItems.length > 0 && <PastBookingsToClose slug={slug} items={pastItems} autoDays={AUTO_COMPLETE_AFTER_DAYS} />}

      {reminders.length > 0 && <TomorrowReminders slug={slug} dayLabel={dayLongLabel(tomorrow)} items={reminders} />}

      {/* The tabs prefetch the other view, so switching is instant (and then quietly refreshed). */}
      <PendingNavProvider routeKey={view}>
        <RequestViewTabs view={view} upcomingHref={upcomingHref} historyHref={historyHref} />

        <PendingArea>
          {history ? (
            <HistoryList slug={slug} initial={history.items} initialNext={history.next} />
          ) : (
          <div className="flex flex-col gap-4">
            {groups.size === 0 && (
              <div className="rounded-2xl border-2 border-navy-900 bg-white p-6 text-center text-slate-600">
                <p className="text-3xl" aria-hidden>
                  📭
                </p>
                <p className="mt-2 font-semibold">Nema zakazanih termina.</p>
                <p className="mt-1 text-sm">Novi zahtevi se ovde pojavljuju sami, bez osvežavanja.</p>
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
          )}
        </PendingArea>
      </PendingNavProvider>
    </div>
  );
}
