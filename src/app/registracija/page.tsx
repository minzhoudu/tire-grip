import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { defaultLoginTarget } from "@/server/origin";
import { getSessionUser } from "@/server/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Registracija · Moj Vulkanizer" };

export default async function SignupPage() {
  await connection();
  if (await getSessionUser()) redirect(await defaultLoginTarget());

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          🛞
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold">Registracija</h1>
          <p className="text-sm text-slate-600">Dovedite svoju radnju na Moj Vulkanizer</p>
        </div>
      </div>
      <SignupForm />
    </main>
  );
}
