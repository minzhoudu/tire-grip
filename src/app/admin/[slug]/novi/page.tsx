import { getDb } from "@/db";
import { ManualBookingForm } from "@/components/admin/manual-booking-form";
import { shopToday } from "@/lib/availability";
import { getAdminBase, requireShopAccess } from "@/server/session";
import { loadShopContext } from "@/server/shops";

type Props = {
  params: Promise<{ slug: string }>;
  /** Set when coming from a tap in Raspored: ?datum=2026-10-27&vreme=10:30&boks=2 */
  searchParams: Promise<{ datum?: string; vreme?: string; boks?: string }>;
};

export default async function NewBookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { shop } = await requireShopAccess(slug);
  const [ctx, base, q] = await Promise.all([loadShopContext(getDb(), slug), getAdminBase(slug), searchParams]);
  const services = (ctx?.services ?? []).filter((s) => s.bookable && s.prices.length > 0);
  const today = shopToday(shop, new Date());

  const date = q.datum && /^\d{4}-\d{2}-\d{2}$/.test(q.datum) && q.datum >= today ? q.datum : today;
  const time = q.vreme && /^\d{2}:\d{2}$/.test(q.vreme) ? q.vreme : null;
  const bayNum = Number(q.boks);
  const bay = shop.bays > 1 && Number.isInteger(bayNum) && bayNum >= 1 && bayNum <= shop.bays ? bayNum : null;

  return (
    <div>
      <h1 className="mb-1 px-1 font-mono text-xl font-bold">Novi termin</h1>
      <p className="mb-4 px-1 text-sm text-slate-600">Za kupce koji zovu telefonom. Dovoljno je izabrati vreme, podaci kupca nisu obavezni.</p>
      <ManualBookingForm
        slug={slug}
        base={base}
        services={services}
        vehicleTypes={ctx?.vehicleTypes ?? []}
        today={today}
        initial={{ date, time, bay }}
      />
    </div>
  );
}
