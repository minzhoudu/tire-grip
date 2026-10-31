"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteBookingAction } from "@/app/admin/[slug]/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";

/** Support-only ("Uđi kao"): removes the booking from the database for good, after a second tap. */
export function SupportDeleteButton({ slug, bookingId, onDeleted }: { slug: string; bookingId: string; onDeleted: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const r = await deleteBookingAction({ slug, bookingId });
      if (!r.ok) {
        toast(r.reason === "not_found" ? "Termin je već obrisan." : "Brisanje nije dozvoljeno.", "error");
        setConfirming(false);
        return;
      }
      onDeleted();
      toast("Termin je obrisan iz baze.");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-dashed border-red-200 pt-3">
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold active:scale-[0.98] disabled:opacity-60 ${
          confirming ? "bg-red-600 text-white" : "border-2 border-red-300 bg-white text-red-700"
        }`}
      >
        {pending && <InlineSpinner />}
        {confirming ? "Sigurno? Briše se zauvek, bez istorije" : "🛠️ Obriši iz baze (podrška)"}
      </button>
      {confirming && !pending && (
        <button type="button" onClick={() => setConfirming(false)} className="mt-1 w-full py-1 text-xs text-slate-500">
          Odustani
        </button>
      )}
    </div>
  );
}
