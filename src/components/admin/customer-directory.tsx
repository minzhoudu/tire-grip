"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadCustomersAction } from "@/app/admin/[slug]/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/phone";
import type { ShopCustomerRow } from "@/server/customers";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function visitLabel(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "poseta";
  const last = n % 10;
  return last >= 2 && last <= 4 ? "posete" : "poseta";
}

/**
 * Kupci: search (in the URL as ?q=, so Back keeps it) and "Učitaj još". The server renders the first
 * page for the current search; the list below is remounted (key) whenever the search changes.
 */
export function CustomerDirectory({
  slug,
  base,
  q,
  initial,
  initialHasMore,
}: {
  slug: string;
  base: string;
  q: string;
  initial: ShopCustomerRow[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onType(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const term = value.trim();
      startSearch(() => router.replace(term ? `${pathname}?q=${encodeURIComponent(term)}` : pathname, { scroll: false }));
    }, 300);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Typed but not sent yet, or sent and loading: show the spinner either way.
  const busy = searching || text.trim() !== q;

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Pretraga kupaca</span>
        <input
          type="search"
          inputMode="search"
          maxLength={80}
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder="Ime ili telefon"
          className="w-full rounded-xl border-2 border-navy-900 bg-white py-3 pr-10 pl-10 text-base outline-none focus:ring-2 focus:ring-navy-700/20"
        />
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" aria-hidden>
          🔍
        </span>
        {busy && (
          <span className="absolute top-1/2 right-3.5 -translate-y-1/2">
            <InlineSpinner />
          </span>
        )}
      </label>

      <div className={`transition-opacity ${busy ? "opacity-50" : ""}`}>
        <CustomerList key={q} slug={slug} base={base} q={q} initial={initial} initialHasMore={initialHasMore} />
      </div>
    </div>
  );
}

function CustomerList({
  slug,
  base,
  q,
  initial,
  initialHasMore,
}: {
  slug: string;
  base: string;
  q: string;
  initial: ShopCustomerRow[];
  initialHasMore: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    startTransition(async () => {
      const r = await loadCustomersAction({ slug, q, offset: rows.length });
      if (!r.ok) {
        toast("Učitavanje nije uspelo. Pokušajte ponovo.", "error");
        return;
      }
      setRows((old) => {
        const seen = new Set(old.map((c) => c.id));
        return [...old, ...r.rows.filter((c) => !seen.has(c.id))];
      });
      setHasMore(r.hasMore);
    });
  }

  if (rows.length === 0) {
    return <p className="px-1 text-sm text-slate-500">{q ? `Nema kupaca za „${q}“.` : "Još nema kupaca."}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`${base}/kupci/${c.id}`} className="block rounded-2xl border-2 border-navy-900 bg-white p-4 active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="truncate text-sm text-slate-500">{formatPhone(c.phone)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {c.visitCount} {visitLabel(c.visitCount)}
                </span>
              </div>
              {c.lastVisitAt && <p className="mt-1 text-xs text-slate-400">Poslednja poseta {formatDate(new Date(c.lastVisitAt))}</p>}
            </Link>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-xl border-2 border-navy-900 bg-white px-4 py-3 font-bold active:scale-[0.98] disabled:opacity-70"
        >
          {pending ? (
            <>
              <InlineSpinner />
              Učitavam…
            </>
          ) : (
            "Učitaj još"
          )}
        </button>
      )}
    </div>
  );
}
