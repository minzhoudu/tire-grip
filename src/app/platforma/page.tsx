import type { Metadata } from "next";
import { ShopList } from "@/components/platform/shop-list";
import { getDb } from "@/db";
import { listAllShops } from "@/server/platform";
import { requirePlatformAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Platforma · Tire Grip", robots: { index: false } };

export default async function PlatformDashboardPage() {
  await requirePlatformAdmin();
  const shops = await listAllShops(getDb());

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-slate-100">
      <header className="sticky top-0 z-20 bg-navy-900 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-white">
        <p className="font-mono text-lg font-bold">Platforma</p>
        <p className="text-sm text-slate-300">Sve radnje na Tire Grip-u</p>
        <div className="hazard-stripe -mx-4 mt-3" />
      </header>
      <div className="flex-1 px-3 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <ShopList shops={shops} />
      </div>
    </div>
  );
}
