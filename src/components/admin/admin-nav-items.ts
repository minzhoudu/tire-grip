export interface AdminNavItem {
  href: string;
  label: string;
  badge?: number;
}

/** Shared between the mobile top tabs (AdminNav) and the desktop sidebar (AdminSidebar). `base` comes from getAdminBase(slug). */
export function getAdminNavItems(base: string, pending: number, isOwner: boolean): AdminNavItem[] {
  return [
    { href: base, label: "Zahtevi", badge: pending },
    { href: `${base}/novi`, label: "+ Novi termin" },
    { href: `${base}/blokade`, label: "Blokade" },
    ...(isOwner ? [{ href: `${base}/statistika`, label: "Statistika" }] : []),
    ...(isOwner ? [{ href: `${base}/podsetnici`, label: "Podsetnici" }] : []),
    ...(isOwner ? [{ href: `${base}/podesavanja`, label: "Podešavanja" }] : []),
  ];
}
