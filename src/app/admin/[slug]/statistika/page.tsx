import { getDb } from "@/db";
import { autoCompleteStale } from "@/server/admin";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { formatRsd } from "@/lib/availability/labels";
import { hasFeature } from "@/lib/plan";
import { WeekdayChart, WeeklyChart } from "@/components/admin/stats/stats-charts";
import { getShopStats } from "@/server/stats";
import { requireOwnerAccess } from "@/server/session";

export default async function StatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);

  if (!hasFeature(shop.plan, "statistika")) {
    return (
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="font-mono text-xl font-bold">Statistika</h1>
        </div>
        <PlanUpgradeNotice feature="Statistika" />
      </div>
    );
  }

  await autoCompleteStale(getDb(), shop.id);
  const stats = await getShopStats(getDb(), shop);

  const maxServiceCount = Math.max(1, ...stats.topServices.map((s) => s.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Statistika</h1>
        <p className="text-sm text-slate-600">Poslednjih 8 nedelja, zaključno sa ovom.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Promet" value={formatRsd(stats.totalRevenueRsd)} accent />
        <StatCard
          label="Termina"
          value={String(stats.totalCount)}
          note={stats.cancelledCount > 0 ? `+ ${stats.cancelledCount} otkazano ili odbijeno` : undefined}
        />
        <StatCard label="Nedolasci" value={stats.noShowRate === null ? "–" : `${stats.noShowRate.toFixed(0)}%`} />
        <StatCard label="Zakazano unapred" value={String(stats.upcomingCount)} />
      </div>

      <WeeklyChart weeks={stats.weeks} />
      <WeekdayChart byWeekday={stats.byWeekday} />

      <section className="rounded-2xl border-2 border-navy-900 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Najtraženije usluge</p>
        {stats.topServices.length === 0 ? (
          <p className="text-sm text-slate-500">Nema termina u ovom periodu.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {stats.topServices.map((s) => (
              <div key={s.serviceId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {s.serviceIcon} {s.serviceName}
                  </span>
                  <span className="font-mono font-bold">{s.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-navy-900" style={{ width: `${(s.count / maxServiceCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, accent, note }: { label: string; value: string; accent?: boolean; note?: string }) {
  return (
    <div className="rounded-2xl border-2 border-navy-900 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold ${accent ? "text-rust-600" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{note}</p>}
    </div>
  );
}
