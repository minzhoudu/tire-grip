import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { getShopBasics } from "@/server/customers";
import { LookupForm } from "./lookup-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShopBasics(getDb(), slug);
  return { title: shop ? `Moji termini · ${shop.name}` : "Radnja nije pronađena" };
}

export default async function MyBookingsPage({ params }: Props) {
  await connection();
  const { slug } = await params;
  const shop = await getShopBasics(getDb(), slug);
  if (!shop) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          🔎
        </div>
        <div>
          <p className="font-mono text-lg font-bold">{shop.name}</p>
          <p className="text-sm text-slate-600">Moji termini</p>
        </div>
      </div>
      <LookupForm slug={slug} />
    </main>
  );
}
