"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { approveShopAction, changeShopPlanAction, rejectShopAction, setShopActiveAction, startImpersonationAction } from "@/app/platforma/actions";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import type { PlatformShopRow } from "@/server/platform";

const PLAN_LABELS: Record<PlatformShopRow["plan"], string> = {
  internal: "Interno",
  trial: "Probni",
  basic: "Basic",
  pro: "Pro",
};
const PLANS = Object.keys(PLAN_LABELS) as PlatformShopRow["plan"][];

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  rejected: "bg-slate-200 text-slate-600",
  suspended: "bg-red-100 text-red-800",
  active: "bg-emerald-100 text-emerald-900",
};

function statusOf(s: PlatformShopRow): keyof typeof STATUS_BADGE {
  if (s.signupStatus === "pending") return "pending";
  if (s.signupStatus === "rejected") return "rejected";
  return s.isActive ? "active" : "suspended";
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Na čekanju",
  rejected: "Odbijena",
  suspended: "Suspendovana",
  active: "Aktivna",
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function ShopList({ shops }: { shops: PlatformShopRow[] }) {
  return (
    <ToastProvider>
      <List shops={shops} />
    </ToastProvider>
  );
}

function List({ shops }: { shops: PlatformShopRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const pendingShops = shops.filter((s) => s.signupStatus === "pending");
  const others = shops.filter((s) => s.signupStatus !== "pending");

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const r = await action();
      if (!r.ok) toast(r.error ?? "Nije uspelo.", "error");
      else toast(okMsg);
      router.refresh();
    });
  }

  function impersonate(shopId: string) {
    startTransition(async () => {
      const r = await startImpersonationAction({ shopId });
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      router.push(r.adminUrl);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {pendingShops.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="px-1 font-mono text-sm font-bold tracking-wide text-slate-500 uppercase">Na čekanju ({pendingShops.length})</h2>
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
            {pendingShops.map((s) => (
              <ShopCard key={s.id} shop={s} pending={pending}>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => approveShopAction({ shopId: s.id }), "Odobreno.")}
                    className="flex-1 rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-2.5 font-mono font-bold text-navy-950 disabled:opacity-50"
                  >
                    Odobri
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => rejectShopAction({ shopId: s.id }), "Odbijeno.")}
                    className="flex-1 rounded-xl border-2 border-red-300 px-4 py-2.5 font-semibold text-red-700 disabled:opacity-50"
                  >
                    Odbij
                  </button>
                </div>
              </ShopCard>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="px-1 font-mono text-sm font-bold tracking-wide text-slate-500 uppercase">Sve radnje ({others.length})</h2>
        {others.length === 0 ? (
          <p className="px-1 text-sm text-slate-500">Još nema odobrenih radnji.</p>
        ) : (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
          {others.map((s) => (
            <ShopCard key={s.id} shop={s} pending={pending}>
              {s.signupStatus === "approved" && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">Plan</span>
                    <select
                      disabled={pending}
                      defaultValue={s.plan}
                      onChange={(e) => run(() => changeShopPlanAction({ shopId: s.id, plan: e.target.value as PlatformShopRow["plan"] }), "Plan promenjen.")}
                      className="rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {PLAN_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{s.isActive ? "Aktivna" : "Suspendovana"}</span>
                    <Toggle
                      checked={s.isActive}
                      disabled={pending}
                      label={s.isActive ? "Suspenduj radnju" : "Aktiviraj radnju"}
                      onChange={(v) => run(() => setShopActiveAction({ shopId: s.id, isActive: v }), v ? "Aktivirano." : "Suspendovano.")}
                    />
                  </div>
                </div>
              )}
              {s.signupStatus === "approved" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => impersonate(s.id)}
                  className="mt-3 w-full rounded-xl border-2 border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Uđi kao (podrška)
                </button>
              )}
            </ShopCard>
          ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ShopCard({ shop: s, pending, children }: { shop: PlatformShopRow; pending: boolean; children?: React.ReactNode }) {
  const status = statusOf(s);
  return (
    <article className={`rounded-2xl border-2 border-navy-900 bg-white p-4 ${pending ? "opacity-90" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono font-bold">{s.name}</p>
          <p className="truncate text-sm text-slate-500">/{s.slug}{s.city ? ` · ${s.city}` : ""}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="mt-2 border-t border-slate-100 pt-2 text-sm text-slate-600">
        <p>
          {s.ownerName ?? "Nepoznat vlasnik"} {s.ownerEmail && <span className="text-slate-400">· {s.ownerEmail}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
          {s.phone && <span>📞 {s.phone}</span>}
          <span>Registrovano {formatDate(s.createdAt)}</span>
          <span className="font-mono">{s.bookingCount} termina</span>
          {s.signupStatus !== "pending" && <span>Plan: {PLAN_LABELS[s.plan]}</span>}
        </p>
      </div>
      {children}
    </article>
  );
}
