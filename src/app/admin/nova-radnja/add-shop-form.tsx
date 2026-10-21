"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { checkSlugAction } from "@/app/registracija/actions";
import { slugify } from "@/lib/slug";
import { addShopAction } from "../actions";

const input =
  "w-full rounded-xl border bg-white px-3.5 py-3 text-base outline-none transition focus:ring-2 border-slate-300 focus:border-navy-700 focus:ring-navy-700/20";

type SlugStatus = "idle" | "checking" | "available" | "taken";

interface Fields {
  shopName: string;
  slug: string;
  city: string;
  phone: string;
}

export function AddShopForm() {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>({ shopName: "", slug: "", city: "", phone: "" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "", form: "" }));
  }

  useEffect(() => {
    if (!slugEdited) setFields((f) => ({ ...f, slug: slugify(f.shopName) }));
  }, [fields.shopName, slugEdited]);

  useEffect(() => {
    if (fields.slug.length < 2) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const id = setTimeout(() => {
      checkSlugAction({ slug: fields.slug })
        .then((r) => setSlugStatus(r.available ? "available" : "taken"))
        .catch(() => setSlugStatus("idle"));
    }, 400);
    return () => clearTimeout(id);
  }, [fields.slug]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (slugStatus === "taken") {
      setErrors((er) => ({ ...er, slug: "Ta adresa je već zauzeta." }));
      return;
    }
    startTransition(async () => {
      const r = await addShopAction(fields);
      if (!r.ok) {
        setErrors(r.errors);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-navy-900 bg-white p-5 text-center">
        <p className="font-mono text-lg font-bold">✅ Poslato</p>
        <p className="mt-2 text-sm text-slate-600">Nova radnja ide na pregled — javićemo se kad bude odobrena.</p>
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="mt-4 rounded-xl border-2 border-navy-900 bg-accent-500 px-6 py-3 font-mono font-bold text-navy-950 active:scale-[0.98]"
        >
          Nazad na vaše radnje
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-navy-900 bg-white p-5" noValidate>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Naziv radnje *</span>
        <input
          className={`${input} mt-1.5 ${errors.shopName ? "border-red-400" : ""}`}
          placeholder="npr. Vulkanizer Brzi Točak"
          value={fields.shopName}
          onChange={(e) => set("shopName", e.target.value)}
        />
        {errors.shopName && <span className="mt-1 block text-sm text-red-700">{errors.shopName}</span>}
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Internet adresa</span>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            className={`${input} font-mono ${errors.slug ? "border-red-400" : ""}`}
            value={fields.slug}
            onChange={(e) => {
              setSlugEdited(true);
              set("slug", slugify(e.target.value));
            }}
          />
          <span className="font-mono text-sm text-slate-400">.mojvulkanizer.com</span>
        </div>
        {errors.slug ? (
          <span className="mt-1 block text-sm text-red-700">{errors.slug}</span>
        ) : slugStatus === "checking" ? (
          <span className="mt-1 block text-sm text-slate-400">Proveravam…</span>
        ) : slugStatus === "available" ? (
          <span className="mt-1 block text-sm text-emerald-700">✓ Dostupno</span>
        ) : slugStatus === "taken" ? (
          <span className="mt-1 block text-sm text-red-700">Zauzeto, izaberite drugu adresu</span>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Grad</span>
        <input className={`${input} mt-1.5`} placeholder="npr. Novi Sad" value={fields.city} onChange={(e) => set("city", e.target.value)} />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Telefon (za kontakt oko odobrenja) *</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="06x xxx xxxx"
          className={`${input} mt-1.5 ${errors.phone ? "border-red-400" : ""}`}
          value={fields.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
        {errors.phone && <span className="mt-1 block text-sm text-red-700">{errors.phone}</span>}
      </label>

      {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-3.5 font-mono text-base font-bold text-navy-950 active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Šaljem…" : "Dodaj radnju"}
      </button>
      <p className="text-center text-xs text-slate-500">Nova radnja ide na pregled — javićemo se kad bude odobrena.</p>
    </form>
  );
}
