import Link from "next/link";
import { getDb } from "@/db";
import { getPlatformStats } from "@/server/platform-stats";
import { shopAdminUrl } from "@/server/origin";

/** "2026-10-13" → "13.10." */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

export default async function PlatformStatsPage() {
  const stats = await getPlatformStats(getDb());
  const maxWeekCount = Math.max(1, ...stats.weeks.map((w) => w.count));
  const maxShopCount = Math.max(1, ...stats.topShops.map((s) => s.count));
  const totalShops = stats.shopCounts.pending + stats.shopCounts.active + stats.shopCounts.suspended + stats.shopCounts.rejected;

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Statistika platforme</h1>
        <p className="text-sm text-slate-600">Poslednjih 8 nedelja, sve radnje zajedno.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Aktivnih radnji" value={String(stats.shopCounts.active)} accent />
        <StatCard label="Na čekanju" value={String(stats.shopCounts.pending)} />
        <StatCard label="Termina (8 ned.)" value={String(stats.totalBookingsInWindow)} />
        <StatCard label="Termina ukupno" value={String(stats.totalBookingsAllTime)} />
      </div>

      <section className="rounded-2xl border-2 border-navy-900 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Termini po nedelji (sve radnje)</p>
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
        <p className="mb-3 text-sm font-semibold text-slate-700">Najaktivnije radnje (8 ned.)</p>
        {stats.topShops.length === 0 ? (
          <p className="text-sm text-slate-500">Nema termina u ovom periodu.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {stats.topShops.map((s) => (
              <Link key={s.shopId} href={shopAdminUrl(s.shopSlug)} className="block">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{s.shopName}</span>
                  <span className="font-mono font-bold">{s.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-navy-900" style={{ width: `${(s.count / maxShopCount) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border-2 border-navy-900 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Radnje po statusu ({totalShops} ukupno)</p>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <StatusPill label="Aktivne" value={stats.shopCounts.active} />
          <StatusPill label="Na čekanju" value={stats.shopCounts.pending} />
          <StatusPill label="Suspendovane" value={stats.shopCounts.suspended} />
          <StatusPill label="Odbijene" value={stats.shopCounts.rejected} />
        </div>
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

function StatusPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="font-mono text-lg font-bold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
