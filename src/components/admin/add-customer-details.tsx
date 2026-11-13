"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { attachBookingCustomerAction, type BookingCustomerView } from "@/app/admin/[slug]/actions";
import { useToast } from "@/components/ui/toast";

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

/**
 * On a Rezervacija radnje: adds the customer's details afterwards. A phone moves the booking to
 * that customer (WhatsApp confirmation and reminders work from then on); a name alone is just shown.
 */
export function AddCustomerDetails({
  slug,
  bookingId,
  onSaved,
}: {
  slug: string;
  bookingId: string;
  /** The saved details, so the card shows them at once — also in lists a refresh doesn't reload (Istorija). */
  onSaved: (customer: BookingCustomerView) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({ name: "", phone: "", vehicleLabel: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-navy-700">
        ✍️ Upiši podatke kupca
      </button>
    );
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const r = await attachBookingCustomerAction({ slug, bookingId, ...fields });
      if (!r.ok) {
        if (r.reason === "invalid") setErrors(r.errors);
        else if (r.reason === "empty") setErrors({ name: "Upišite ime ili telefon" });
        else toast("Termin više nije bez podataka. Osvežavam…", "error");
        if (r.reason === "not_found") router.refresh();
        return;
      }
      toast("Podaci kupca su sačuvani.");
      setOpen(false);
      onSaved(r.customer);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex w-full flex-col gap-2 rounded-xl bg-slate-50 p-3" noValidate>
      {(
        [
          ["name", "Ime", "text", "npr. Marko"],
          ["phone", "Telefon", "tel", "06x xxx xxxx"],
          ["vehicleLabel", "Auto", "text", "npr. Golf 7"],
        ] as const
      ).map(([key, label, type, placeholder]) => (
        <label key={key} className="block">
          <span className="text-xs font-semibold text-slate-600">{label}</span>
          <input
            type={type}
            placeholder={placeholder}
            className={`${input} mt-1 ${errors[key] ? "border-red-400" : ""}`}
            value={fields[key]}
            onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
          />
          {errors[key] && <span className="mt-1 block text-xs text-red-700">{errors[key]}</span>}
        </label>
      ))}
      <p className="text-xs text-slate-500">Sa brojem telefona kupac dobija WhatsApp potvrdu i podsetnike.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border-2 border-slate-300 py-2 text-sm font-semibold text-slate-700">
          Otkaži
        </button>
        <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-navy-900 py-2 text-sm font-bold text-white disabled:opacity-60">
          {pending ? "Čuvam…" : "Sačuvaj"}
        </button>
      </div>
    </form>
  );
}
