/** What a service costs and how long it takes for a given vehicle type. A vehicle type is a shop-owned row (its id), not a fixed set. */
export type VehicleType = string;

export interface ServiceLike {
  durationMin: number;
  bookable: boolean;
  isActive: boolean;
}

export interface ServicePriceLike {
  vehicleTypeId: VehicleType;
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
export function resolveOffer(service: ServiceLike, prices: ServicePriceLike[], vehicleTypeId: VehicleType): Offer | null {
  if (!service.isActive || !service.bookable) return null;
  const row = prices.find((p) => p.vehicleTypeId === vehicleTypeId);
  if (!row) return null;
  return { priceRsd: row.priceRsd, durationMin: row.durationMin ?? service.durationMin };
}
