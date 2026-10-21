"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAdminNavItems } from "./admin-nav-items";

export function AdminSidebar({ base, pending, isOwner }: { base: string; pending: number; isOwner: boolean }) {
  const path = usePathname();
  const items = getAdminNavItems(base, pending, isOwner);

  return (
    <nav className="flex flex-col gap-1" aria-label="Panel">
      {items.map((t) => {
        const active = t.href === base ? path === base : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${
              active ? "bg-accent-500 text-navy-950" : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {t.label}
            {!!t.badge && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold ${
                  active ? "bg-navy-900 text-accent-500" : "bg-accent-500 text-navy-950"
                }`}
              >
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
