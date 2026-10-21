import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { listUserShops } from "@/server/accounts";
import { shopAdminUrl } from "@/server/origin";
import { requireUser } from "@/server/session";
import { signOutAction } from "./[slug]/actions";

export const metadata: Metadata = { title: "Panel · Tire Grip", robots: { index: false } };

export default async function AdminHome() {
  await connection();
  const user = await requireUser("/admin");
  const shops = await listUserShops(getDb(), user.id);

  const usable = shops.filter((s) => s.signupStatus === "approved" && s.isActive);
  if (shops.length === 1 && usable.length === 1) redirect(shopAdminUrl(usable[0]!.slug));

  const pending = shops.filter((s) => s.signupStatus === "pending");
  const rejected = shops.filter((s) => s.signupStatus === "rejected");
  const suspended = shops.filter((s) => s.signupStatus === "approved" && !s.isActive);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <h1 className="font-mono text-2xl font-bold">Vaše radnje</h1>
      <p className="mt-1 text-sm text-slate-600">Prijavljeni ste kao {user.email}</p>

      {shops.length === 0 && (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">Ovaj nalog još nije dodat ni u jednu radnju.</p>
      )}

      {pending.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {pending.map((s) => (
            <div key={s.slug} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <p className="font-bold text-amber-900">⏳ {s.name}</p>
              <p className="mt-1 text-sm text-amber-800">Registracija je poslata i čeka pregled. Javićemo vam se na broj koji ste ostavili.</p>
            </div>
          ))}
        </div>
      )}

      {suspended.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {suspended.map((s) => (
            <div key={s.slug} className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
              <p className="font-bold text-red-900">⛔ {s.name}</p>
              <p className="mt-1 text-sm text-red-800">Pristup je privremeno obustavljen. Kontaktirajte nas za detalje.</p>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {rejected.map((s) => (
            <div key={s.slug} className="rounded-2xl border-2 border-slate-300 bg-slate-100 p-4">
              <p className="font-bold text-slate-700">{s.name}</p>
              <p className="mt-1 text-sm text-slate-600">Zahtev za registraciju nije odobren.</p>
            </div>
          ))}
        </div>
      )}

      {usable.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {usable.map((s) => (
            <li key={s.slug}>
              <Link href={shopAdminUrl(s.slug)} className="block rounded-2xl border-2 border-navy-900 bg-white p-4 font-semibold active:bg-slate-50">
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
