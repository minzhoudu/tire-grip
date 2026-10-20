import { getDb } from "@/db";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { WorkingHoursEditor } from "@/components/admin/settings/working-hours-editor";
import { listWorkingHours } from "@/server/settings";
import { requireOwnerAccess } from "@/server/session";

export default async function WorkingHoursPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const weeklyHours = await listWorkingHours(getDb(), shop.id);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader slug={slug} title="Radno vreme" description="Nedeljni raspored, ponavlja se svake nedelje. Za jedan datum koristite Praznike, za jednokratnu pauzu Blokade." />
      <WorkingHoursEditor slug={slug} weeklyHours={weeklyHours} />
    </div>
  );
}
