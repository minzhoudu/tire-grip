import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { dayLongLabel, formatRsd, utcToZoned } from "@/lib/availability";
import { formatMinutes } from "@/lib/availability/zoned";
import { canSelfCancel, getCancellableBooking } from "@/server/cancel";
import { CancelForm } from "./cancel-form";

export const metadata: Metadata = { title: "Otkazivanje termina · Moj Vulkanizer", robots: { index: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CancelPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const booking = await getCancellableBooking(getDb(), id);
  if (!booking) notFound();

  const local = utcToZoned(booking.startsAt, booking.shopTimezone);
  const dayLabel = dayLongLabel(local.date);
  const time = formatMinutes(local.minutes);
  const cancellable = canSelfCancel(booking);
  const started = booking.startsAt.getTime() <= Date.now();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          {booking.serviceIcon ?? "🛞"}
        </div>
        <div>
          <p className="font-mono text-lg font-bold">{booking.shopName}</p>
          <p className="text-sm text-slate-600">Otkazivanje termina</p>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-navy-900 bg-white p-5">
        <p className="font-mono text-xl font-bold">
          {dayLabel} u {time}h
        </p>
        <p className="mt-1 text-slate-700">
          {booking.serviceName} · {formatRsd(booking.priceRsd)}
        </p>
        <p className="mt-1 text-sm text-slate-500">{booking.customerName}</p>

        {cancellable ? (
          <CancelForm id={booking.id} />
        ) : (
          <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {booking.status === "cancelled"
              ? "Ovaj termin je već otkazan."
              : booking.status === "rejected"
                ? "Ovaj zahtev je odbijen, nema šta da se otkaže."
                : started
                  ? "Termin je već prošao, ne može se otkazati ovde."
                  : "Ovaj termin je završen."}
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href={`/${booking.shopSlug}`} className="font-semibold text-navy-700 underline">
          Zakažite novi termin
        </Link>
      </p>
    </main>
  );
}
