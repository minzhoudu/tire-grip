import Link from "next/link";
import { getDb } from "@/db";
import { CampaignForm } from "@/components/admin/reminders/campaign-form";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { hasFeature } from "@/lib/plan";
import { listCampaigns } from "@/server/reminders";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

const SEASON_ICON: Record<string, string> = { winter: "❄️", summer: "☀️" };
const STATUS_LABEL: Record<string, string> = { draft: "Priprema", active: "U toku", done: "Završena" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-200 text-slate-600",
  active: "bg-amber-100 text-amber-900",
  done: "bg-emerald-100 text-emerald-900",
};

export default async function RemindersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);

  if (!hasFeature(shop.plan, "podsetnici")) {
    return (
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="font-mono text-xl font-bold">Podsetnici</h1>
        </div>
        <PlanUpgradeNotice feature="Podsetnici" />
      </div>
    );
  }

  const [campaigns, base] = await Promise.all([listCampaigns(getDb(), shop.id), getAdminBase(slug)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Podsetnici</h1>
        <p className="text-sm text-slate-600">Sezonski podsetnik za zamenu guma kupcima koji su na to pristali. Vi tapnete, poruka ide preko WhatsApp-a.</p>
      </div>

      {campaigns.length > 0 && (
        <ul className="flex flex-col gap-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/podsetnici/${c.id}`} className="block rounded-2xl border-2 border-navy-900 bg-white p-4 active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    {SEASON_ICON[c.season]} {c.name}
                  </p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {c.queued + c.sent + c.booked === 0
                    ? "Lista nije generisana"
                    : `${c.queued} za slanje · ${c.sent} poslato · ${c.booked} zakazalo`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CampaignForm slug={slug} base={base} />
    </div>
  );
}
