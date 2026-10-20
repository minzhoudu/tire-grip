"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One row in the "Podešavanja" hub (mobile) or sidebar (desktop) — icon,
 * title, a short live summary, and a chevron. Highlights itself when its
 * route is the current one (meaningful on the desktop sidebar, where it's
 * always visible alongside the open category).
 */
export function SettingsRow({ href, icon, title, subtitle }: { href: string; icon: string; title: string; subtitle: string }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl border-2 p-4 ${
        active ? "border-navy-900 bg-accent-500" : "border-navy-900 bg-white active:bg-slate-50"
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-xl text-accent-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${active ? "text-navy-950" : "text-slate-900"}`}>{title}</p>
        <p className={`truncate text-sm ${active ? "text-navy-900/70" : "text-slate-500"}`}>{subtitle}</p>
      </div>
      <span aria-hidden className={`shrink-0 text-xl ${active ? "text-navy-900/50" : "text-slate-300"}`}>
        ›
      </span>
    </Link>
  );
}
