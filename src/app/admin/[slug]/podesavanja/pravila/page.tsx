import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { BookingRulesForm } from "@/components/admin/settings/booking-rules-form";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

export default async function BookingRulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader base={await getAdminBase(slug)} title="Pravila zakazivanja" />
      <BookingRulesForm
        slug={slug}
        rules={{
          bays: shop.bays,
          slotStepMin: shop.slotStepMin,
          bookingHorizonDays: shop.bookingHorizonDays,
          minNoticeMin: shop.minNoticeMin,
          autoConfirm: shop.autoConfirm,
        }}
      />
    </div>
  );
}
