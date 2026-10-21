import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { ShopInfoForm } from "@/components/admin/settings/shop-info-form";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

export default async function ShopInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader base={await getAdminBase(slug)} title="Podaci radnje" />
      <ShopInfoForm slug={slug} shop={{ name: shop.name, city: shop.city, address: shop.address, phone: shop.phone }} />
    </div>
  );
}
