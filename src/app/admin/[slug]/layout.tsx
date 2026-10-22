import type { Metadata } from "next";
import { connection } from "next/server";
import { getDb } from "@/db";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { ShopSwitcher } from "@/components/admin/shop-switcher";
import { ToastProvider } from "@/components/ui/toast";
import { listUserShops } from "@/server/accounts";
import { countPending } from "@/server/admin";
import { addShopUrl, getOrigin, shopAdminUrl, shopPublicUrl } from "@/server/origin";
import { getAdminBase, requireShopAccess } from "@/server/session";
import { endImpersonationAction, signOutAction } from "./actions";

export const metadata: Metadata = { title: "Panel | Moj Vulkanizer", robots: { index: false } };

export default async function AdminShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const { shop, user, role, isImpersonating } = await requireShopAccess(slug);
  const [pending, base, origin, userShops, newShopUrl] = await Promise.all([
    countPending(getDb(), shop),
    getAdminBase(slug),
    getOrigin(),
    isImpersonating ? Promise.resolve([]) : listUserShops(getDb(), user.id),
    addShopUrl(),
  ]);
  const publicUrl = shopPublicUrl(shop.slug, origin);
  const otherShops = userShops
    .filter((s) => s.slug !== shop.slug && s.signupStatus === "approved" && s.isActive)
    .map((s) => ({ name: s.name, url: shopAdminUrl(s.slug) }));

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-slate-100 md:items-stretch">
        {/* Desktop sidebar — mobile keeps the sticky top header + tabs below instead. */}
        <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:bg-navy-900 md:text-white">
          <div className="flex items-start justify-between gap-2 p-5">
            <div className="min-w-0">
              <p className="truncate font-mono text-lg leading-tight font-bold">{shop.name}</p>
              <p className="truncate text-xs text-slate-300">{user.name}</p>
            </div>
            {!isImpersonating && <ShopSwitcher otherShops={otherShops} addShopUrl={newShopUrl} />}
          </div>
          <div className="flex-1 px-3">
            <AdminSidebar base={base} pending={pending} isOwner={role === "owner"} plan={shop.plan} />
          </div>
          <div className="flex flex-col gap-2 p-4">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white/10 px-3 py-2 text-center text-xs font-semibold"
            >
              Stranica za kupce ↗
            </a>
            <form action={signOutAction}>
              <button className="w-full rounded-full px-3 py-2 text-center text-xs text-slate-300 hover:text-white">Odjava</button>
            </form>
          </div>
        </aside>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col md:mx-0 md:max-w-none">
          {isImpersonating && (
            <div className="flex items-center justify-between gap-3 bg-accent-500 px-4 py-2 text-sm font-semibold text-navy-950">
              <span>🛠️ Podrška: ulogovani ste kao {shop.name}, u ime vlasnika</span>
              <form action={endImpersonationAction}>
                <button className="shrink-0 rounded-full border-2 border-navy-900 bg-white px-3 py-1 text-xs font-bold">Završi pristup</button>
              </form>
            </div>
          )}
          <header className="sticky top-0 z-20 bg-navy-900 text-white shadow-md md:hidden">
            <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-lg leading-tight font-bold">{shop.name}</p>
                <p className="truncate text-xs text-slate-300">{user.name}</p>
              </div>
              {!isImpersonating && <ShopSwitcher otherShops={otherShops} addShopUrl={newShopUrl} />}
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
              >
                Stranica za kupce ↗
              </a>
            </div>
            <AdminNav base={base} pending={pending} isOwner={role === "owner"} plan={shop.plan} signOutAction={signOutAction} />
            <div className="hazard-stripe" />
          </header>
          <div className="flex-1 px-3 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-10 md:pt-10">
            <div className="md:mx-auto md:max-w-3xl">{children}</div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
