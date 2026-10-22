import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { defaultLoginTarget } from "@/server/origin";
import { getSessionUser } from "@/server/session";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Zaboravljena lozinka | Moj Vulkanizer", robots: { index: false } };

export default async function ForgotPasswordPage() {
  await connection();
  if (await getSessionUser()) redirect(await defaultLoginTarget());

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          🔑
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold">Zaboravljena lozinka</h1>
          <p className="text-sm text-slate-600">Pošaljemo vam link za resetovanje</p>
        </div>
      </div>
      <ForgotPasswordForm />
    </main>
  );
}
