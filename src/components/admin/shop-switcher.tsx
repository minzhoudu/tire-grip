"use client";

import { useRouter } from "next/navigation";
import { Menu, type MenuItem } from "@/components/ui/menu";

/** Next to the shop name in the admin header: jump to another shop on this account, or start a new one. */
export function ShopSwitcher({ otherShops, addShopUrl }: { otherShops: { name: string; url: string }[]; addShopUrl: string }) {
  const router = useRouter();
  const items: MenuItem[] = [
    ...otherShops.map((s) => ({ label: s.name, onClick: () => router.push(s.url) })),
    { label: "+ Nova radnja", onClick: () => router.push(addShopUrl) },
  ];
  return (
    <Menu
      items={items}
      triggerClassName="grid size-6 shrink-0 place-items-center rounded-full border border-white/20 text-xs text-slate-300 hover:text-white"
      ariaLabel="Radnje na ovom nalogu"
    />
  );
}
