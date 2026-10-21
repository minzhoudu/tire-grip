"use client";

import { useState, useTransition } from "react";
import { updateShopInfoAction } from "@/app/admin/[slug]/podesavanja/actions";
import { useToast } from "@/components/ui/toast";
import { input, primaryButton } from "./ui";

export function ShopInfoForm({
  slug,
  shop,
}: {
  slug: string;
  shop: { name: string; businessLabel: string | null; city: string | null; address: string | null; phone: string | null };
}) {
  const toast = useToast();
  const [fields, setFields] = useState({
    name: shop.name,
    businessLabel: shop.businessLabel ?? "",
    city: shop.city ?? "",
    address: shop.address ?? "",
    phone: shop.phone ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateShopInfoAction({ slug, ...fields });
      if (r.ok) {
        setErrors({});
        toast("Sačuvano.");
      } else {
        setErrors(r.errors);
        if (r.errors.form) toast(r.errors.form, "error");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
      {(
        [
          ["name", "Naziv radnje", undefined, undefined],
          ["businessLabel", "Vrsta delatnosti", "Vulkanizer", "Piše ispod naziva kod kupca, npr. „Perionica“ ako radnja nudi samo pranje. Prazno polje = „Vulkanizer“."],
          ["city", "Grad", undefined, undefined],
          ["address", "Adresa", undefined, undefined],
          ["phone", "Telefon (za WhatsApp/Viber)", undefined, undefined],
        ] as const
      ).map(([key, label, placeholder, hint]) => (
        <label key={key} className="block">
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          <input
            className={`${input} mt-1.5 ${errors[key] ? "border-red-400" : ""}`}
            value={fields[key]}
            placeholder={placeholder}
            onChange={(e) => {
              setFields((f) => ({ ...f, [key]: e.target.value }));
              setErrors((er) => ({ ...er, [key]: "" }));
            }}
          />
          {hint && !errors[key] && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
          {errors[key] && <span className="mt-1 block text-sm text-red-700">{errors[key]}</span>}
        </label>
      ))}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Čuvam…" : "Sačuvaj"}
      </button>
    </form>
  );
}
