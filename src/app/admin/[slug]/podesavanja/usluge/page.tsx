import Link from "next/link";
import { getDb } from "@/db";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { ServicesEditor } from "@/components/admin/settings/services-editor";
import { listServicesForSettings, listVehicleTypesForSettings } from "@/server/settings";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

export default async function ServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const db = getDb();
  const [services, vehicleTypes, base] = await Promise.all([
    listServicesForSettings(db, shop.id),
    listVehicleTypesForSettings(db, shop.id),
    getAdminBase(slug),
  ]);
  const hasActiveVehicleType = vehicleTypes.some((vt) => vt.isActive);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader base={base} title="Usluge i cene" description="Šta nudite, po kojoj ceni i za koliko vremena, za svaku vrstu vozila." />
      {!hasActiveVehicleType && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Prvo podesite bar jednu vrstu vozila</p>
          <p className="mt-1">Cena i trajanje usluge se određuju po vozilu, pa nema šta da se unese dok ne postoji bar jedna vrsta vozila.</p>
          <Link href={`${base}/podesavanja/vrste-vozila`} className="mt-2 inline-block font-semibold text-amber-900 underline">
            Idi na Vrste vozila →
          </Link>
        </div>
      )}
      <ServicesEditor slug={slug} services={services} vehicleTypes={vehicleTypes} />
    </div>
  );
}
