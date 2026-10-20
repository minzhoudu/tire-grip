import { getDb } from "@/db";
import { BookingRulesForm } from "@/components/admin/settings/booking-rules-form";
import { ExceptionsEditor } from "@/components/admin/settings/exceptions-editor";
import { ServicesEditor } from "@/components/admin/settings/services-editor";
import { ShopInfoForm } from "@/components/admin/settings/shop-info-form";
import { WorkingHoursEditor } from "@/components/admin/settings/working-hours-editor";
import { shopToday } from "@/lib/availability";
import { listExceptions, listServicesForSettings, listWorkingHours } from "@/server/settings";
import { requireOwnerAccess } from "@/server/session";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const db = getDb();
  const [weeklyHours, exceptions, services] = await Promise.all([
    listWorkingHours(db, shop.id),
    listExceptions(db, shop.id),
    listServicesForSettings(db, shop.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="px-1">
        <h1 className="text-xl font-bold">Podešavanja</h1>
        <p className="text-sm text-slate-600">Vidljivo samo vlasniku radnje.</p>
      </div>

      <Section title="Podaci radnje">
        <ShopInfoForm slug={slug} shop={{ name: shop.name, city: shop.city, address: shop.address, phone: shop.phone }} />
      </Section>

      <Section title="Pravila zakazivanja">
        <BookingRulesForm
          slug={slug}
          rules={{
            bays: shop.bays,
            slotStepMin: shop.slotStepMin,
            bookingHorizonDays: shop.bookingHorizonDays,
            minNoticeMin: shop.minNoticeMin,
            autoConfirm: shop.autoConfirm,
          }}
        />
      </Section>

      <Section title="Radno vreme">
        <WorkingHoursEditor slug={slug} weeklyHours={weeklyHours} />
      </Section>

      <Section title="Praznici i posebno radno vreme">
        <ExceptionsEditor slug={slug} exceptions={exceptions} today={shopToday(shop, new Date())} />
      </Section>

      <Section title="Usluge i cene">
        <ServicesEditor slug={slug} services={services} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-base font-bold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}
