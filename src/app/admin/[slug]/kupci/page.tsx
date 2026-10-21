import Link from "next/link";
import { getDb } from "@/db";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { formatPhone } from "@/lib/phone";
import { hasFeature } from "@/lib/plan";
import { listShopCustomers } from "@/server/customers";
import { getAdminBase, requireShopAccess } from "@/server/session";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function visitLabel(n: number): string {
  if (n === 1) return "poseta";
  if (n <= 4) return "posete";
  return "poseta";
}

export default async function CustomersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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

  const [customers, base] = await Promise.all([listShopCustomers(getDb(), shop.id), getAdminBase(slug)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Kupci</h1>
        <p className="text-sm text-slate-600">Svi kupci koji su ikada zakazali kod vas, po poslednjoj poseti.</p>
      </div>

      {customers.length === 0 ? (
        <p className="px-1 text-sm text-slate-500">Još nema kupaca.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/kupci/${c.id}`} className="block rounded-2xl border-2 border-navy-900 bg-white p-4 active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-sm text-slate-500">{formatPhone(c.phone)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {c.visitCount} {visitLabel(c.visitCount)}
                  </span>
                </div>
                {c.lastVisitAt && <p className="mt-1 text-xs text-slate-400">Poslednja poseta {formatDate(c.lastVisitAt)}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
