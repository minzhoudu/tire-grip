"use client";

import { useEffect, useState, useTransition } from "react";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestNotificationAction,
  setEmailNotificationsAction,
} from "@/app/admin/[slug]/obavestenja/actions";
import { primaryButton, secondaryButton } from "@/components/admin/settings/ui";
import { ToggleRow } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { currentSubscription, pushSupport, subscribeThisDevice, toJson } from "./push-client";

type DeviceState =
  | "loading"
  | "not_configured" // no VAPID keys on the server
  | "ios_install" // iPhone in Safari: must be added to the home screen first
  | "unsupported"
  | "denied"
  | "off"
  | "on";

export function NotificationSettings({
  slug,
  vapidPublicKey,
  email,
  emailNotifications: initialEmail,
  deviceCount,
  isImpersonating,
}: {
  slug: string;
  vapidPublicKey: string | null;
  email: string;
  emailNotifications: boolean;
  deviceCount: number;
  isImpersonating: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState<DeviceState>("loading");
  const [busy, startTransition] = useTransition();
  const [emailOn, setEmailOn] = useState(initialEmail);

  useEffect(() => {
    void (async () => {
      const support = pushSupport();
      if (!vapidPublicKey) return setState("not_configured");
      if (support.ios && !support.standalone) return setState("ios_install");
      if (!support.supported) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const sub = Notification.permission === "granted" ? await currentSubscription() : null;
      setState(sub ? "on" : "off");
    })();
  }, [vapidPublicKey]);

  function enable() {
    if (!vapidPublicKey) return;
    startTransition(async () => {
      try {
        const sub = await subscribeThisDevice(vapidPublicKey);
        if (sub === "denied") {
          setState(Notification.permission === "denied" ? "denied" : "off");
          toast("Obaveštenja nisu dozvoljena.", "error");
          return;
        }
        const r = await savePushSubscriptionAction({ slug, subscription: toJson(sub) });
        if (!r.ok) {
          await sub.unsubscribe();
          toast(r.error, "error");
          return;
        }
        setState("on");
        toast("Obaveštenja su uključena.");
        await sendTestNotificationAction({ slug });
      } catch {
        toast("Uključivanje nije uspelo. Proverite internet pa pokušajte ponovo.", "error");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      const sub = await currentSubscription();
      if (sub) {
        await removePushSubscriptionAction({ slug, endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
      toast("Obaveštenja su isključena na ovom uređaju.");
    });
  }

  function test() {
    startTransition(async () => {
      const r = await sendTestNotificationAction({ slug });
      toast(r.ok ? "Probno obaveštenje je poslato." : r.error, r.ok ? "success" : "error");
    });
  }

  function toggleEmail(enabled: boolean) {
    setEmailOn(enabled);
    startTransition(async () => {
      const r = await setEmailNotificationsAction({ slug, enabled });
      if (!r.ok) {
        setEmailOn(!enabled);
        toast(r.error, "error");
      }
    });
  }

  if (isImpersonating) {
    return (
      <section className="rounded-2xl border-2 border-navy-900 bg-white p-4 text-sm text-slate-600">
        Obaveštenja podešava svaki član radnje na svom telefonu. Nije dostupno u režimu podrške.
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
        <div>
          <h2 className="font-semibold text-slate-900">Ovaj telefon</h2>
          <p className="text-sm text-slate-600">Dobijate obaveštenje čim kupac pošalje zahtev ili otkaže termin.</p>
        </div>
        <DeviceStatus state={state} busy={busy} onEnable={enable} onDisable={disable} onTest={test} />
        {deviceCount > 0 && (
          <p className="text-xs text-slate-500">
            Uključeno na {deviceCount} {deviceCount === 1 ? "uređaju" : "uređaja"} (za vaš nalog).
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
        <ToggleRow
          checked={emailOn}
          onChange={toggleEmail}
          disabled={busy}
          title="Email kao rezerva"
          description={`Ako nijedan vaš uređaj nema uključena obaveštenja, iste poruke šaljemo na ${email}.`}
        />
      </section>
    </div>
  );
}

function DeviceStatus({
  state,
  busy,
  onEnable,
  onDisable,
  onTest,
}: {
  state: DeviceState;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => void;
}) {
  switch (state) {
    case "loading":
      return <p className="text-sm text-slate-500">Proveravam…</p>;
    case "not_configured":
      return <Note>Push obaveštenja još nisu podešena na serveru. Do tada stižu na email.</Note>;
    case "ios_install":
      return <IosInstallSteps />;
    case "unsupported":
      return (
        <Note>
          Ovaj pregledač ne podržava obaveštenja. Na iPhone-u je potreban iOS 16.4 ili noviji (Podešavanja → Opšte → Ažuriranje softvera), a na
          Androidu otvorite panel u Chrome-u.
        </Note>
      );
    case "denied":
      return (
        <Note>
          Obaveštenja su blokirana. iPhone: Podešavanja → Obaveštenja → izaberite aplikaciju radnje → Dozvoli obaveštenja. Android: dugo pritisnite
          ikonicu → Informacije o aplikaciji → Obaveštenja. Zatim se vratite ovde.
        </Note>
      );
    case "off":
      return (
        <button type="button" onClick={onEnable} disabled={busy} className={primaryButton}>
          {busy ? "Uključujem…" : "🔔 Uključi obaveštenja"}
        </button>
      );
    case "on":
      return (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">✅ Obaveštenja su uključena na ovom telefonu.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onTest} disabled={busy} className={secondaryButton}>
              Pošalji probno
            </button>
            <button type="button" onClick={onDisable} disabled={busy} className={secondaryButton}>
              Isključi
            </button>
          </div>
        </div>
      );
  }
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</p>;
}

function IosInstallSteps() {
  const steps = [
    <>
      U Safariju dodirnite <b>Podeli</b> <ShareIcon /> (dole na sredini ekrana).
    </>,
    <>
      Izaberite <b>Dodaj na početni ekran</b>, pa <b>Dodaj</b>.
    </>,
    <>
      Otvorite panel preko nove ikonice na početnom ekranu, uđite ovde (Meni → Obaveštenja) i dodirnite <b>Uključi obaveštenja</b>.
    </>,
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-700">Na iPhone-u obaveštenja rade samo kad je panel dodat na početni ekran. Jednom podesite:</p>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-accent-500">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-slate-500">Potreban je iOS 16.4 ili noviji. U aplikaciji sa početnog ekrana se prijavljujete jednom.</p>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg aria-label="ikonica Podeli" viewBox="0 0 24 24" className="inline size-4 align-text-bottom text-sky-600" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" strokeLinecap="round" />
    </svg>
  );
}
