import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-bold">Tire Grip</h1>
      <p className="text-slate-600">Zakazivanje zamene guma za vulkanizere.</p>
      {process.env.NODE_ENV !== "production" && (
        <Link href="/brzi-tocak" className="font-semibold text-navy-700 underline">
          Demo radnja: Brzi Točak →
        </Link>
      )}
    </main>
  );
}
