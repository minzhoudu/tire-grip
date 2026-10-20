import type { Metadata } from "next";
import { connection } from "next/server";
import { getDb } from "@/db";
import { AdminNav } from "@/components/admin/admin-nav";
import { countPending } from "@/server/admin";
import { requireShopAccess } from "@/server/session";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: "Panel · Tire Grip", robots: { index: false } };

export default async function AdminShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const { shop, user, role } = await requireShopAccess(slug);
  const pending = await countPending(getDb(), shop);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-slate-100">
      <header className="sticky top-0 z-20 bg-navy-900 text-white shadow-md">
        <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg leading-tight font-bold">{shop.name}</p>
            <p className="truncate text-xs text-slate-300">{user.name}</p>
          </div>
          <a
            href={`/${shop.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
          >
            Stranica za kupce ↗
          </a>
          <form action={signOutAction}>
            <button className="rounded-full px-2 py-1.5 text-xs text-slate-300 hover:text-white">Odjava</button>
          </form>
        </div>
        <AdminNav slug={shop.slug} pending={pending} isOwner={role === "owner"} />
      </header>
      <div className="flex-1 px-3 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
