"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { currentSubscription, pushSupport } from "./push-client";

const DISMISS_KEY = "push-prompt-dismissed";

/** Card on Zahtevi nudging members to turn on notifications on this phone, until they do it or close it. */
export function EnablePushPrompt({ href }: { href: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    void (async () => {
      if (localStorage.getItem(DISMISS_KEY)) return;
      const { supported, ios, standalone } = pushSupport();
      if (ios && !standalone) return setShow(true); // iPhone in Safari: first step is adding it to the home screen
      if (!supported || Notification.permission === "denied") return; // nothing they can do on this browser
      if (Notification.permission === "granted" && (await currentSubscription())) return;
      setShow(true);
    })();
  }, []);

  if (!show) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-navy-900 bg-accent-500 p-3.5">
      <span aria-hidden className="text-2xl">
        🔔
      </span>
      <Link href={href} className="min-w-0 flex-1">
        <p className="font-semibold text-navy-950">Uključite obaveštenja</p>
        <p className="text-sm text-navy-900/80">Saznajte za novi zahtev odmah, i kad panel nije otvoren.</p>
      </Link>
      <button
        type="button"
        aria-label="Zatvori"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
        className="shrink-0 rounded-full px-2 py-1 text-lg text-navy-900/60"
      >
        ✕
      </button>
    </div>
  );
}
