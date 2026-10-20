"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ slug, pending, isOwner }: { slug: string; pending: number; isOwner: boolean }) {
  const path = usePathname();
  const base = `/admin/${slug}`;
  const tabs = [
    { href: base, label: "Zahtevi", badge: pending },
    { href: `${base}/novi`, label: "+ Novi termin" },
    { href: `${base}/blokade`, label: "Blokade" },
    ...(isOwner ? [{ href: `${base}/podesavanja`, label: "Podešavanja" }] : []),
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto px-2" aria-label="Panel">
      {tabs.map((t) => {
        const active = t.href === base ? path === base : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 border-b-[3px] px-3 py-2.5 text-sm font-semibold whitespace-nowrap ${
              active ? "border-accent-500 text-white" : "border-transparent text-slate-300"
            }`}
          >
            {t.label}
            {!!t.badge && (
              <span className="rounded-full bg-accent-500 px-1.5 py-0.5 text-[11px] leading-none font-bold text-navy-950">
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
