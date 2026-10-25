import { getDb } from "@/db";
import { autoCompleteStale } from "@/server/admin";
import { PlanUpgradeNotice } from "@/components/admin/plan-upgrade-notice";
import { formatRsd } from "@/lib/availability/labels";
import { hasFeature } from "@/lib/plan";
import { getShopStats } from "@/server/stats";
import { requireOwnerAccess } from "@/server/session";

const WEEKDAY_LABEL = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];

/** "2026-10-13" → "13.10." */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

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

  const maxWeekCount = Math.max(1, ...stats.weeks.map((w) => w.count));
  const maxWeekdayCount = Math.max(1, ...stats.byWeekday.map((d) => d.count));
  const maxServiceCount = Math.max(1, ...stats.topServices.map((s) => s.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Statistika</h1>
        <p className="text-sm text-slate-600">Poslednjih 8 nedelja.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Promet" value={formatRsd(stats.totalRevenueRsd)} accent />
        <StatCard label="Termina" value={String(stats.totalCount)} />
        <StatCard label="Nedolasci" value={stats.noShowRate === null ? "–" : `${stats.noShowRate.toFixed(0)}%`} />
      </div>

      <section className="rounded-2xl border-2 border-navy-900 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Termini po nedelji</p>
        <div className="flex h-32 items-end gap-2">
          {stats.weeks.map((w) => (
            <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-slate-600">{w.count || ""}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t ${w.count > 0 ? "bg-navy-900" : "bg-slate-100"}`}
                  style={{ height: `${Math.max(w.count > 0 ? 4 : 0, (w.count / maxWeekCount) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500">{shortDate(w.weekStart)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-navy-900 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Najprometniji dani</p>
        <div className="flex h-24 items-end gap-2">
          {stats.byWeekday.map((d) => (
            <div key={d.weekday} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-slate-600">{d.count || ""}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t ${d.count > 0 ? "bg-accent-500" : "bg-slate-100"}`}
                  style={{ height: `${Math.max(d.count > 0 ? 6 : 0, (d.count / maxWeekdayCount) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500">{WEEKDAY_LABEL[d.weekday - 1]}</span>
            </div>
          ))}
        </div>
      </section>

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

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-navy-900 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold ${accent ? "text-rust-600" : ""}`}>{value}</p>
    </div>
  );
}
