import { getDb } from "@/db";
import { SettingsRow } from "@/components/admin/settings/settings-row";
import { listExceptions, listServicesForSettings, listWorkingHours } from "@/server/settings";
import { requireOwnerAccess } from "@/server/session";

export default async function SettingsHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const db = getDb();
  const [weeklyHours, exceptions, services] = await Promise.all([
    listWorkingHours(db, shop.id),
    listExceptions(db, shop.id),
    listServicesForSettings(db, shop.id),
  ]);

  const openDays = new Set(weeklyHours.map((h) => h.weekday)).size;
  const activeServices = services.filter((s) => s.isActive).length;
  const base = `/admin/${slug}/podesavanja`;

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Podešavanja</h1>
        <p className="text-sm text-slate-600">Vidljivo samo vlasniku radnje.</p>
      </div>

      <SettingsRow href={`${base}/radnja`} icon="🏪" title="Podaci radnje" subtitle={[shop.city, shop.address].filter(Boolean).join(" · ") || "Naziv, grad, adresa, telefon"} />
      <SettingsRow
        href={`${base}/pravila`}
        icon="⚙️"
        title="Pravila zakazivanja"
        subtitle={`${shop.bays} ${shop.bays === 1 ? "dizalica" : "dizalice"} · ${shop.slotStepMin} min korak · auto-potvrda ${shop.autoConfirm ? "uključena" : "isključena"}`}
      />
      <SettingsRow href={`${base}/radno-vreme`} icon="🕒" title="Radno vreme" subtitle={openDays === 0 ? "Radnja je zatvorena svih dana" : `Otvoreno ${openDays}/7 dana u nedelji`} />
      <SettingsRow
        href={`${base}/praznici`}
        icon="📅"
        title="Praznici i posebno radno vreme"
        subtitle={exceptions.length === 0 ? "Nema predstojećih izuzetaka" : `${exceptions.length} predstojeć${exceptions.length === 1 ? "i" : "ih"}`}
      />
      <SettingsRow href={`${base}/usluge`} icon="🛞" title="Usluge i cene" subtitle={`${activeServices}/${services.length} aktivno`} />
    </div>
  );
}
