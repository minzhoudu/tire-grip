import { getDb } from "@/db";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { ServicesEditor } from "@/components/admin/settings/services-editor";
import { listServicesForSettings, listVehicleTypesForSettings } from "@/server/settings";
import { requireOwnerAccess } from "@/server/session";

export default async function ServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const db = getDb();
  const [services, vehicleTypes] = await Promise.all([listServicesForSettings(db, shop.id), listVehicleTypesForSettings(db, shop.id)]);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader slug={slug} title="Usluge i cene" />
      <ServicesEditor slug={slug} services={services} vehicleTypes={vehicleTypes} />
    </div>
  );
}
