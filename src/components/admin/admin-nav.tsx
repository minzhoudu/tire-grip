"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Shop } from "@/db/schema";
import { getAdminNavItems } from "./admin-nav-items";

/**
 * Mobile-only burger menu for the panel nav — replaces the old horizontally
 * scrollable tab bar. Opens a dropdown with every nav link plus logout, so
 * the sticky header stays compact on small screens.
 */
export function AdminNav({
  base,
  pending,
  isOwner,
  plan,
  signOutAction,
}: {
  base: string;
  pending: number;
  isOwner: boolean;
  plan: Shop["plan"];
  signOutAction: () => Promise<void>;
}) {
  const path = usePathname();
  const items = getAdminNavItems(base, pending, isOwner, plan);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  const pendingBadge = items.find((i) => i.href === base)?.badge;

  return (
    <div className="relative px-2 pb-2 md:hidden" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Meni"
        className="flex items-center gap-2 rounded-full border-2 border-white/20 px-3 py-1.5 text-sm font-semibold text-white"
      >
        <span aria-hidden>☰</span>
        Meni
        {!!pendingBadge && (
          <span className="rounded-full bg-accent-500 px-1.5 py-0.5 text-[11px] leading-none font-bold text-navy-950">{pendingBadge}</span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute left-2 z-30 mt-1.5 w-60 overflow-hidden rounded-xl border-2 border-navy-900 bg-white shadow-lg">
          {items.map((t) => {
            const active = t.href === base ? path === base : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold ${
                  active ? "bg-accent-500 text-navy-950" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t.label}
                {!!t.badge && (
                  <span className="rounded-full bg-navy-900 px-1.5 py-0.5 text-[11px] leading-none font-bold text-accent-500">{t.badge}</span>
                )}
              </Link>
            );
          })}
          <form action={signOutAction}>
            <button type="submit" role="menuitem" className="block w-full border-t-2 border-navy-900 px-4 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
              Odjava
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
