/**
 * Demo data: one shop ("Brzi Točak", Inđija) with services, prices and hours.
 * Safe to re-run — the demo shop is purged and recreated.
 *
 *   pnpm db:seed
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { bookings, scheduleExceptions, servicePrices, services, shops, workingHours } from "./schema";

const SLUG = "brzi-tocak";

async function main() {
  await db.transaction(async (tx) => {
    // Purge order: bookings first (history FKs), then the shop cascades the rest.
    const existing = await tx.query.shops.findFirst({ where: eq(shops.slug, SLUG) });
    if (existing) {
      await tx.delete(bookings).where(eq(bookings.shopId, existing.id));
      await tx.delete(shops).where(eq(shops.id, existing.id));
    }

    const [shop] = await tx
      .insert(shops)
      .values({
        slug: SLUG,
        name: "Vulkanizer Brzi Točak",
        city: "Inđija",
        address: "Primer adresa 12",
        phone: "+381641234567",
        plan: "internal",
        bays: 2,
        slotStepMin: 30,
      })
      .returning();
    if (!shop) throw new Error("shop insert failed");

    const svc = await tx
      .insert(services)
      .values([
        { shopId: shop.id, kind: "seasonal_swap", name: "Zamena guma", icon: "🔄", durationMin: 30, sortOrder: 1,
          description: "Zamena letnje ↔ zimske, gume su već na felnama" },
        { shopId: shop.id, kind: "mount_balance", name: "Montaža + balansiranje", icon: "🛞", durationMin: 45, sortOrder: 2,
          description: "Skidanje i montaža guma na felne, balansiranje" },
        { shopId: shop.id, kind: "repair", name: "Popravka gume", icon: "🔧", durationMin: 20, sortOrder: 3 },
        { shopId: shop.id, kind: "storage", name: "Čuvanje guma", icon: "📦", bookable: false, sortOrder: 4,
          description: "Cena po sezoni za set od 4 gume" },
      ])
      .returning();
    const byKind = Object.fromEntries(svc.map((s) => [s.kind, s]));

    const price = (kind: keyof typeof byKind, car: number, suv: number, van: number, suvMin?: number, vanMin?: number) => [
      { shopId: shop.id, serviceId: byKind[kind]!.id, vehicleType: "car" as const, priceRsd: car },
      { shopId: shop.id, serviceId: byKind[kind]!.id, vehicleType: "suv" as const, priceRsd: suv, durationMin: suvMin },
      { shopId: shop.id, serviceId: byKind[kind]!.id, vehicleType: "van" as const, priceRsd: van, durationMin: vanMin },
    ];
    await tx.insert(servicePrices).values([
      ...price("seasonal_swap", 1500, 2000, 2500, 40, 45),
      ...price("mount_balance", 2800, 3600, 4200, 60, 60),
      ...price("repair", 800, 1000, 1200),
      ...price("storage", 3000, 3500, 4000),
    ]);

    // Mon–Fri 08–17, Sat 08–14, Sunday closed
    await tx.insert(workingHours).values([
      ...[1, 2, 3, 4, 5].map((weekday) => ({ shopId: shop.id, weekday, opensAt: "08:00", closesAt: "17:00" })),
      { shopId: shop.id, weekday: 6, opensAt: "08:00", closesAt: "14:00" },
    ]);

    await tx.insert(scheduleExceptions).values([
      { shopId: shop.id, date: "2026-11-11", closed: true, note: "Dan primirja" },
    ]);

    console.log(`Seeded demo shop "${shop.name}" → /${shop.slug}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
