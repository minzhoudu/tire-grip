"use client";

import { useState, useTransition } from "react";
import { resetUserPasswordAction } from "@/app/platforma/actions";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup/request";
import type { PlatformUserRow } from "@/server/platform";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function UserList({ users }: { users: PlatformUserRow[] }) {
  return (
    <ToastProvider>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
        {users.map((u) => (
          <UserCard key={u.id} user={u} />
        ))}
      </div>
    </ToastProvider>
  );
}

function UserCard({ user }: { user: PlatformUserRow }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await resetUserPasswordAction({ userId: user.id, newPassword: password });
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      toast("Lozinka promenjena.");
      setPassword("");
      setOpen(false);
    });
  }

  return (
    <article className="rounded-2xl border-2 border-navy-900 bg-white p-4">
      <p className="truncate font-mono font-bold">{user.name}</p>
      <p className="truncate text-sm text-slate-500">{user.email}</p>
      <p className="mt-1 text-xs text-slate-400">Registrovan {formatDate(user.createdAt)}</p>
      {user.shops.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {user.shops.map((s) => (
            <li key={s.slug} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {s.shopName} · {s.role === "owner" ? "vlasnik" : "osoblje"}
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl border-2 border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
        >
          Resetuj lozinku
        </button>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`Nova lozinka (bar ${MIN_PASSWORD_LENGTH} karaktera)`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {pending ? "Čuvam…" : "Sačuvaj"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPassword("");
              }}
              className="rounded-xl border-2 border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Otkaži
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
