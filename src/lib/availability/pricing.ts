/** What a service costs and how long it takes for a given vehicle type. */
export type VehicleType = "car" | "suv" | "van";

export interface ServiceLike {
  durationMin: number;
  bookable: boolean;
  isActive: boolean;
}

export interface ServicePriceLike {
  vehicleType: VehicleType;
  priceRsd: number;
  durationMin: number | null;
}

export interface Offer {
  priceRsd: number;
  durationMin: number;
}

/**
 * Price and duration for one service + vehicle type, or null when the shop
 * doesn't offer it (inactive, info-only, or no price row for that vehicle).
 * A price row's duration overrides the service default (SUV takes longer).
 */
export function resolveOffer(service: ServiceLike, prices: ServicePriceLike[], vehicleType: VehicleType): Offer | null {
  if (!service.isActive || !service.bookable) return null;
  const row = prices.find((p) => p.vehicleType === vehicleType);
  if (!row) return null;
  return { priceRsd: row.priceRsd, durationMin: row.durationMin ?? service.durationMin };
}
