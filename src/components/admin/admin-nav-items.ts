export interface AdminNavItem {
  href: string;
  label: string;
  badge?: number;
}

/** Shared between the mobile top tabs (AdminNav) and the desktop sidebar (AdminSidebar). */
export function getAdminNavItems(slug: string, pending: number, isOwner: boolean): AdminNavItem[] {
  const base = `/admin/${slug}`;
  return [
    { href: base, label: "Zahtevi", badge: pending },
    { href: `${base}/novi`, label: "+ Novi termin" },
    { href: `${base}/blokade`, label: "Blokade" },
    ...(isOwner ? [{ href: `${base}/podsetnici`, label: "Podsetnici" }] : []),
    ...(isOwner ? [{ href: `${base}/podesavanja`, label: "Podešavanja" }] : []),
  ];
}
