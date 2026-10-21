import type { Shop } from "../db/schema.ts";

export type PlanFeature = "blokade" | "kupci" | "statistika" | "podsetnici";

/** Basic has none of the gated features; Zahtevi/Novi termin/Podešavanja are always available to every plan. */
const BASIC_FEATURES = new Set<PlanFeature>();

export function hasFeature(plan: Shop["plan"], feature: PlanFeature): boolean {
  if (plan === "basic") return BASIC_FEATURES.has(feature);
  return true;
}
