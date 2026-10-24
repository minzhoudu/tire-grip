"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCampaignAction } from "@/app/admin/[slug]/podsetnici/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";

/** Two taps to delete (like the booking card's destructive actions), then back to the campaign list. */
export function DeleteCampaignButton({ slug, campaignId, sentCount, listHref }: { slug: string; campaignId: string; sentCount: number; listHref: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const r = await deleteCampaignAction({ slug, campaignId });
      if (!r.ok) {
        toast("Brisanje nije uspelo.", "error");
        setConfirming(false);
        return;
      }
      toast("Kampanja obrisana.");
      router.push(listHref);
    });
  }

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-white p-4">
      {confirming && (
        <p className="mb-3 text-sm text-slate-700">
          {sentCount > 0
            ? `Kupci koji su već dobili poruku (${sentCount}) neće moći da otvore link iz nje. Termini koje su zakazali ostaju.`
            : "Kampanja i njena lista se brišu. Nijedna poruka još nije poslata."}
        </p>
      )}
      <div className="flex gap-2">
        {confirming && !pending && (
          <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-xl border-2 border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
            Odustani
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold ${
            confirming ? "bg-red-600 text-white" : "border-2 border-red-200 text-red-700"
          }`}
        >
          {pending ? (
            <>
              <InlineSpinner />
              Brišem…
            </>
          ) : confirming ? (
            "Sigurno? Obriši kampanju"
          ) : (
            "Obriši kampanju"
          )}
        </button>
      </div>
    </div>
  );
}
