import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DirectoryView, type DirectoryItem } from "@/components/directory/directory-view";
import { getDb } from "@/db";
import { listDirectory } from "@/server/directory";
import { getOrigin, shopPublicUrl } from "@/server/origin";

export const metadata: Metadata = {
  title: "Pronađi vulkanizera | Moj Vulkanizer",
  description: "Vulkanizeri na mapi: ko radi sada, prvi slobodan termin i zakazivanje bez zvanja.",
};

export default async function DirectoryPage() {
  await connection(); // open status and free slots are live
  const [shops, origin] = await Promise.all([listDirectory(getDb()), getOrigin()]);
  const items: DirectoryItem[] = shops.map((s) => ({ ...s, url: shopPublicUrl(s.slug, origin) }));

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-navy-900 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-white md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-500 text-lg" aria-hidden>
              🛞
            </span>
            <span className="font-mono font-bold">Moj Vulkanizer</span>
          </Link>
          <Link href="/registracija" className="text-sm font-semibold text-slate-300 underline-offset-2 hover:underline">
            Imate radnju?
          </Link>
        </div>
      </header>
      <div className="hazard-stripe" />

      <main className="mx-auto max-w-6xl px-4 py-5 md:px-8">
        <h1 className="font-mono text-2xl font-bold">Pronađi vulkanizera</h1>
        <p className="mt-1 mb-4 text-sm text-slate-600">Ko radi sada, prvi slobodan termin i zakazivanje bez zvanja.</p>
        <DirectoryView shops={items} />
      </main>
    </div>
  );
}
