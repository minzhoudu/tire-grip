"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

export function LinkActions({ url, shopName }: { url: string; shopName: string }) {
  const toast = useToast();
  // Native share sheet (WhatsApp, Instagram…) exists on phones; only known after mount.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link je kopiran.");
    } catch {
      toast("Kopiranje nije uspelo. Označite link i kopirajte ga ručno.", "error");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: shopName, text: `Zakažite termin u ${shopName}:`, url });
    } catch {
      // Closing the share sheet rejects too; nothing to report.
    }
  }

  return (
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={copy} className="flex-1 rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-3 text-sm font-bold text-white">
        Kopiraj link
      </button>
      {canShare && (
        <button type="button" onClick={share} className="flex-1 rounded-xl border-2 border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
          Podeli
        </button>
      )}
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex-1 rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-3 text-sm font-bold text-navy-950"
    >
      Odštampaj plakat
    </button>
  );
}
