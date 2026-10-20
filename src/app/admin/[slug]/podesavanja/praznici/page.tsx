import { getDb } from "@/db";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { ExceptionsEditor } from "@/components/admin/settings/exceptions-editor";
import { shopToday } from "@/lib/availability";
import { listExceptions } from "@/server/settings";
import { requireOwnerAccess } from "@/server/session";

export default async function ExceptionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const exceptions = await listExceptions(getDb(), shop.id);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader slug={slug} title="Praznici i posebno radno vreme" description="Zamenjuje nedeljni raspored za tačno jedan datum (cela radnja)." />
      <ExceptionsEditor slug={slug} exceptions={exceptions} today={shopToday(shop, new Date())} />
    </div>
  );
}
