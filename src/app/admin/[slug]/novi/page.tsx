import { getDb } from "@/db";
import { ManualBookingForm } from "@/components/admin/manual-booking-form";
import { shopToday } from "@/lib/availability";
import { requireShopAccess } from "@/server/session";
import { loadShopContext } from "@/server/shops";

export default async function NewBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireShopAccess(slug);
  const ctx = await loadShopContext(getDb(), slug);
  const services = (ctx?.services ?? []).filter((s) => s.bookable && s.prices.length > 0);

  return (
    <div>
      <h1 className="mb-1 px-1 font-mono text-xl font-bold">Novi termin</h1>
      <p className="mb-4 px-1 text-sm text-slate-600">Za kupce koji zovu telefonom. Termin se odmah upisuje kao potvrđen.</p>
      <ManualBookingForm slug={slug} services={services} vehicleTypes={ctx?.vehicleTypes ?? []} today={shopToday(shop, new Date())} />
    </div>
  );
}
