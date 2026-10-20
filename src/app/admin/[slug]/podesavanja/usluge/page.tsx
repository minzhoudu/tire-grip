import { getDb } from "@/db";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { ServicesEditor } from "@/components/admin/settings/services-editor";
import { listServicesForSettings } from "@/server/settings";
import { requireOwnerAccess } from "@/server/session";

export default async function ServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const services = await listServicesForSettings(getDb(), shop.id);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader slug={slug} title="Usluge i cene" />
      <ServicesEditor slug={slug} services={services} />
    </div>
  );
}
