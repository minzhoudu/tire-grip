import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { listUserShops } from "@/server/accounts";
import { requireUser } from "@/server/session";
import { signOutAction } from "./[slug]/actions";

export const metadata: Metadata = { title: "Panel · Tire Grip", robots: { index: false } };

export default async function AdminHome() {
  const user = await requireUser("/admin");
  const shops = await listUserShops(getDb(), user.id);
  if (shops.length === 1) redirect(`/admin/${shops[0]!.slug}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <h1 className="text-2xl font-bold">Vaše radnje</h1>
      <p className="mt-1 text-sm text-slate-600">Prijavljeni ste kao {user.email}</p>
      {shops.length === 0 ? (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">Ovaj nalog još nije dodat ni u jednu radnju.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {shops.map((s) => (
            <li key={s.slug}>
              <Link href={`/admin/${s.slug}`} className="block rounded-2xl bg-white p-4 font-semibold shadow-sm active:bg-slate-50">
                🛞 {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={signOutAction} className="mt-8">
        <button className="text-sm font-medium text-slate-500 underline">Odjavi se</button>
      </form>
    </main>
  );
}
