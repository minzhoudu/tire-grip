import { getDb } from "@/db";
import { BlockForm, BlockList } from "@/components/admin/blocks";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { dayLongLabel, shopToday } from "@/lib/availability";
import { formatMinutes } from "@/lib/availability/zoned";
import { hasFeature } from "@/lib/plan";
import { listUpcomingBlocks } from "@/server/admin";
import { requireShopAccess } from "@/server/session";

export default async function BlocksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireShopAccess(slug);

  if (!hasFeature(shop.plan, "blokade")) {
    return (
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="font-mono text-xl font-bold">Blokirano vreme</h1>
        </div>
        <PlanUpgradeNotice feature="Blokirano vreme" />
      </div>
    );
  }

  const blocks = await listUpcomingBlocks(getDb(), shop);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Blokirano vreme</h1>
        <p className="text-sm text-slate-600">Pauza, kvar boksa, kupci bez zakazivanja: kupci tada ne vide slobodne termine.</p>
      </div>
      <BlockForm slug={slug} bays={shop.bays} today={shopToday(shop, new Date())} />
      <BlockList
        slug={slug}
        blocks={blocks.map((b) => ({
          id: b.id,
          when: `${dayLongLabel(b.date)} · ${formatMinutes(b.fromMin)}–${formatMinutes(b.toMin)}`,
          bay: shop.bays > 1 ? (b.bay === null ? "Svi boksovi" : `Boks ${b.bay}`) : null,
          reason: b.reason,
        }))}
      />
    </div>
  );
}
