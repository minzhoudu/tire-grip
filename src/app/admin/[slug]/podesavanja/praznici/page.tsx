import { getDb } from "@/db";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { ExceptionsEditor } from "@/components/admin/settings/exceptions-editor";
import { HolidayPresets } from "@/components/admin/settings/holiday-presets";
import { dayChipLabel, shopToday } from "@/lib/availability";
import { upcomingSerbianHolidays } from "@/lib/availability/holidays";
import { listExceptions } from "@/server/settings";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

export default async function ExceptionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const exceptions = await listExceptions(getDb(), shop.id);
  const today = shopToday(shop, new Date());
  const taken = new Set(exceptions.map((e) => e.date));
  const holidays = upcomingSerbianHolidays(today).map((h) => ({
    date: h.date,
    label: dayChipLabel(h.date, today),
    name: h.name,
    added: taken.has(h.date),
  }));

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader base={await getAdminBase(slug)} title="Praznici i posebno radno vreme" description="Zamenjuje nedeljni raspored za tačno jedan datum (cela radnja)." />
      <HolidayPresets slug={slug} holidays={holidays} />
      <ExceptionsEditor slug={slug} exceptions={exceptions} today={today} />
    </div>
  );
}
