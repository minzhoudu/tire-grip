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
  shop: { name: string; city: string | null; address: string | null; phone: string | null };
}) {
  const toast = useToast();
  const [fields, setFields] = useState({ name: shop.name, city: shop.city ?? "", address: shop.address ?? "", phone: shop.phone ?? "" });
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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      {(
        [
          ["name", "Naziv radnje"],
          ["city", "Grad"],
          ["address", "Adresa"],
          ["phone", "Telefon (za WhatsApp/Viber)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block">
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          <input
            className={`${input} mt-1.5 ${errors[key] ? "border-red-400" : ""}`}
            value={fields[key]}
            onChange={(e) => {
              setFields((f) => ({ ...f, [key]: e.target.value }));
              setErrors((er) => ({ ...er, [key]: "" }));
            }}
          />
          {errors[key] && <span className="mt-1 block text-sm text-red-700">{errors[key]}</span>}
        </label>
      ))}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Čuvam…" : "Sačuvaj"}
      </button>
    </form>
  );
}
