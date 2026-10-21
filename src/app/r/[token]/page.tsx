import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { getReminderByToken } from "@/server/reminders";
import { OptOutButton } from "./opt-out-button";

export const metadata: Metadata = { title: "Podsetnik za zamenu guma · Moj Vulkanizer", robots: { index: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReminderPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();

  const reminder = await getReminderByToken(getDb(), token);
  if (!reminder) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          🔔
        </div>
        <div>
          <p className="font-mono text-lg font-bold">{reminder.shopName}</p>
          <p className="text-sm text-slate-600">Podsetnik za zamenu guma</p>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-navy-900 bg-white p-5">
        <p className="font-semibold">Zdravo {reminder.customerName}!</p>
        <p className="mt-1 text-slate-700">Vreme je za zamenu guma u {reminder.shopName}. Zakažite termin kad vam odgovara.</p>

        <Link
          href={`/${reminder.shopSlug}?r=${token}`}
          className="mt-5 block rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-3.5 text-center font-mono font-bold text-navy-950 active:scale-[0.98]"
        >
          📅 Zakažite termin
        </Link>

        <OptOutButton token={token} />
      </div>
    </main>
  );
}
