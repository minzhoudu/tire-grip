"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InlineSpinner } from "@/components/ui/busy";
import { Menu, type MenuItem } from "@/components/ui/menu";

/** Next to the shop name in the admin header: jump to another shop on this account, or start a new one. */
export function ShopSwitcher({ otherShops, addShopUrl }: { otherShops: { name: string; url: string }[]; addShopUrl: string }) {
  const router = useRouter();
  // The target is usually another subdomain (a full page load), so this stays up until that page replaces this one.
  const [opening, setOpening] = useState<string | null>(null);
  const open = (label: string, url: string) => {
    setOpening(label);
    router.push(url);
  };

  const items: MenuItem[] = [
    ...otherShops.map((s) => ({ label: s.name, onClick: () => open(`Otvaram ${s.name}…`, s.url) })),
    { label: "+ Nova radnja", onClick: () => open("Otvaram…", addShopUrl) },
  ];
  return (
    <>
      <Menu
        items={items}
        triggerClassName="grid size-6 shrink-0 place-items-center rounded-full border border-white/20 text-xs text-slate-300 hover:text-white"
        ariaLabel="Radnje na ovom nalogu"
      />
      {opening && (
        <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-white/80">
          <span className="flex items-center gap-2 font-semibold text-navy-900">
            <InlineSpinner />
            {opening}
          </span>
        </div>
      )}
    </>
  );
}
