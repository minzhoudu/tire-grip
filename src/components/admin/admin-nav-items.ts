import type { Shop } from "@/db/schema";
import { hasFeature } from "@/lib/plan";

export interface AdminNavItem {
  href: string;
  label: string;
  badge?: number;
}

/** Shared between the mobile nav (AdminNav) and the desktop sidebar (AdminSidebar). `base` comes from getAdminBase(slug). */
export function getAdminNavItems(base: string, pending: number, isOwner: boolean, plan: Shop["plan"]): AdminNavItem[] {
  return [
    { href: base, label: "Zahtevi", badge: pending },
    { href: `${base}/novi`, label: "+ Novi termin" },
    ...(hasFeature(plan, "blokade") ? [{ href: `${base}/blokade`, label: "Blokade" }] : []),
    ...(hasFeature(plan, "kupci") ? [{ href: `${base}/kupci`, label: "Kupci" }] : []),
    ...(isOwner && hasFeature(plan, "statistika") ? [{ href: `${base}/statistika`, label: "Statistika" }] : []),
    ...(isOwner && hasFeature(plan, "podsetnici") ? [{ href: `${base}/podsetnici`, label: "Podsetnici" }] : []),
    ...(isOwner ? [{ href: `${base}/podesavanja`, label: "Podešavanja" }] : []),
  ];
}
