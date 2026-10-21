import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { getSessionUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Prijava · Moj Vulkanizer", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  await connection();
  const { next } = await searchParams;
  const target = safeNextPath(next);
  if (await getSessionUser()) redirect(target);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          🛞
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold">Prijava</h1>
          <p className="text-sm text-slate-600">Panel za vulkanizere</p>
        </div>
      </div>
      <LoginForm next={target} />
    </main>
  );
}
