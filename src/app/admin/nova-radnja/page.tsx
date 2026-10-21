import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/server/session";
import { AddShopForm } from "./add-shop-form";

export const metadata: Metadata = { title: "Nova radnja · Moj Vulkanizer", robots: { index: false } };

export default async function AddShopPage() {
  await connection();
  await requireUser("/admin/nova-radnja");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          🛞
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold">Nova radnja</h1>
          <p className="text-sm text-slate-600">Dodajte još jednu radnju na isti nalog</p>
        </div>
      </div>
      <AddShopForm />
      <Link href="/admin" className="mt-4 text-center text-sm text-slate-500 underline">
        ← Nazad na vaše radnje
      </Link>
    </main>
  );
}
