"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatRsd } from "@/lib/availability";
import { lookupMyBookingsAction, type MyBooking } from "../actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Čeka potvrdu",
  confirmed: "Potvrđeno",
  completed: "Završeno",
  cancelled: "Otkazano",
  rejected: "Odbijeno",
  no_show: "Niste došli",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  completed: "bg-slate-200 text-slate-600",
  cancelled: "bg-slate-200 text-slate-600",
  rejected: "bg-red-100 text-red-800",
  no_show: "bg-red-100 text-red-800",
};

const input =
  "w-full rounded-xl border bg-white px-3.5 py-3 text-base outline-none transition focus:ring-2 border-slate-300 focus:border-navy-700 focus:ring-navy-700/20";

export function LookupForm({ slug }: { slug: string }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<MyBooking[] | "not_found" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await lookupMyBookingsAction({ slug, phone });
      if (!r.ok) {
        if (r.reason === "not_found") setResult("not_found");
        else setError("Unesite ispravan broj telefona.");
        return;
      }
      setResult(r.bookings);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-5">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Broj telefona</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="06x xxx xxxx"
            className={`${input} mt-1.5`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-3.5 font-mono font-bold text-navy-950 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Tražim…" : "Pronađi moje termine"}
        </button>
      </form>

      {result === "not_found" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-center text-sm text-amber-900">
          Nema termina sa tim brojem telefona kod ove radnje.
        </p>
      )}

      {Array.isArray(result) && (
        <ul className="flex flex-col gap-2">
          {result.map((b) => (
            <li key={b.id} className="rounded-2xl border-2 border-navy-900 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono font-bold">
                    {b.dayLabel} u {b.time}h
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {b.serviceIcon} {b.serviceName} · {formatRsd(b.priceRsd)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[b.status]}`}>
                  {STATUS_LABEL[b.status]}
                </span>
              </div>
              {b.upcoming && (
                <Link href={`/otkazi/${b.id}`} className="mt-3 inline-block text-sm font-semibold text-red-700 underline">
                  Otkaži termin
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-sm text-slate-500">
        <Link href={`/${slug}`} className="font-semibold text-navy-700 underline">
          Zakažite novi termin
        </Link>
      </p>
    </div>
  );
}
