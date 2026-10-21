import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/server/session";
import { signOutAction } from "../admin/[slug]/actions";

export const metadata: Metadata = { title: "Platforma · Tire Grip", robots: { index: false } };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="sticky top-0 z-20 bg-navy-900 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-white md:px-10">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-bold">Platforma</p>
            <p className="text-sm text-slate-300">Tire Grip</p>
          </div>
          <form action={signOutAction}>
            <button className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white">Odjava</button>
          </form>
        </div>
        <nav className="mx-auto mt-3 flex max-w-5xl gap-1 text-sm font-semibold" aria-label="Platforma">
          <Link href="/platforma" className="rounded-full px-3 py-1.5 hover:bg-white/10">
            Radnje
          </Link>
          <Link href="/platforma/nalozi" className="rounded-full px-3 py-1.5 hover:bg-white/10">
            Nalozi
          </Link>
        </nav>
        <div className="hazard-stripe -mx-4 mt-3 md:-mx-10" />
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-3 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-10 md:pt-8">{children}</div>
    </div>
  );
}
