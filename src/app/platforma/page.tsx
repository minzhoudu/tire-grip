import { ShopList } from "@/components/platform/shop-list";
import { getDb } from "@/db";
import { listAllShops } from "@/server/platform";

export default async function PlatformDashboardPage() {
  const shops = await listAllShops(getDb());
  return <ShopList shops={shops} />;
}
