"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { generateQueueAction } from "@/app/admin/[slug]/podsetnici/actions";
import { useToast } from "@/components/ui/toast";

export function GenerateQueueButton({ slug, campaignId }: { slug: string; campaignId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await generateQueueAction({ slug, campaignId });
          if (!r.ok) {
            toast(r.error, "error");
            return;
          }
          toast(`Dodato ${r.created} u red za slanje.`);
          router.refresh();
        })
      }
      className="mt-3 w-full rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-3.5 font-mono font-bold text-white active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Pravim listu…" : "Generiši listu"}
    </button>
  );
}
