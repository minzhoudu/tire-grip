import { getDb } from "@/db";
import { autoCompleteStale } from "@/server/admin";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { hasFeature } from "@/lib/plan";
import { CustomerDirectory } from "@/components/admin/customer-directory";
import { searchShopCustomers } from "@/server/customers";
import { getAdminBase, requireShopAccess } from "@/server/session";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> };

export default async function CustomersPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const { shop } = await requireShopAccess(slug);

  if (!hasFeature(shop.plan, "kupci")) {
    return (
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="font-mono text-xl font-bold">Kupci</h1>
        </div>
        <PlanUpgradeNotice feature="Kupci" />
      </div>
    );
  }

  await autoCompleteStale(getDb(), shop.id);
  const [page, base] = await Promise.all([searchShopCustomers(getDb(), shop.id, { q }), getAdminBase(slug)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Kupci</h1>
        <p className="text-sm text-slate-600">Svi kupci koji su ikada zakazali kod vas, po poslednjoj poseti.</p>
      </div>

      <CustomerDirectory slug={slug} base={base} q={q} initial={page.rows} initialHasMore={page.hasMore} />
    </div>
  );
}
