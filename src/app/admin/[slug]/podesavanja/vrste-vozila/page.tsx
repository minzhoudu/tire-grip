import { getDb } from "@/db";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { VehicleTypesEditor } from "@/components/admin/settings/vehicle-types-editor";
import { listVehicleTypesForSettings } from "@/server/settings";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

export default async function VehicleTypesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const vehicleTypes = await listVehicleTypesForSettings(getDb(), shop.id);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader base={await getAdminBase(slug)} title="Vrste vozila" />
      <VehicleTypesEditor slug={slug} vehicleTypes={vehicleTypes} />
    </div>
  );
}
