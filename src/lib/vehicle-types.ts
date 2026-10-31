/**
 * Vehicle types with optional subcategories (one level deep), e.g. "Kamion stočar" → "1 sprat",
 * "2 sprata". A type with subcategories is only a group: prices and bookings point at the
 * subcategories. Pure, so the grouping rules are unit-tested.
 */

export interface VehicleTypeRow {
  id: string;
  parentId: string | null;
  label: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CatalogVehicleType {
  id: string;
  /** Set on a subcategory */
  parentId: string | null;
  /** Its own name: "2 sprata" */
  name: string;
  /** What to show on its own, e.g. in a booking: "Kamion stočar · 2 sprata" */
  label: string;
  /** Subcategories show their parent's icon */
  icon: string | null;
  /** Has subcategories: a heading, never priced or booked itself */
  isGroup: boolean;
}

/** "Kamion stočar · 2 sprata", or just the name for a top-level type. */
export function vehicleTypeLabel(name: string, parentName: string | null | undefined): string {
  return parentName ? `${parentName} · ${name}` : name;
}

/**
 * Active vehicle types in display order: each top-level type, followed by its active subcategories.
 * A switched-off type hides its subcategories too. A type counts as a group as soon as it has any
 * subcategory (even switched off), so it never becomes bookable again by accident.
 */
export function buildVehicleCatalog(rows: VehicleTypeRow[]): CatalogVehicleType[] {
  const bySort = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const groupIds = new Set(rows.flatMap((r) => (r.parentId ? [r.parentId] : [])));
  const out: CatalogVehicleType[] = [];
  for (const top of bySort) {
    if (top.parentId || !top.isActive) continue;
    out.push({ id: top.id, parentId: null, name: top.label, label: top.label, icon: top.icon, isGroup: groupIds.has(top.id) });
    for (const child of bySort) {
      if (child.parentId !== top.id || !child.isActive) continue;
      out.push({ id: child.id, parentId: top.id, name: child.label, label: vehicleTypeLabel(child.label, top.label), icon: top.icon, isGroup: false });
    }
  }
  return out;
}

/** Ids a price or booking may point at: active types that aren't groups. */
export function bookableVehicleTypeIds(catalog: CatalogVehicleType[]): Set<string> {
  return new Set(catalog.filter((vt) => !vt.isGroup).map((vt) => vt.id));
}

export interface VehicleChoice {
  /** A vehicle without subcategories, or a group */
  type: CatalogVehicleType;
  /** For a group: its subcategories that are priced, in order. Empty for a plain vehicle. */
  subtypes: CatalogVehicleType[];
}

/**
 * What the customer picks from for a service, in the shop's order: each vehicle priced for it,
 * and each group with at least one priced subcategory (a group with none is left out).
 */
export function vehicleChoices(catalog: CatalogVehicleType[], pricedIds: Iterable<string>): VehicleChoice[] {
  const priced = new Set(pricedIds);
  return catalog
    .filter((vt) => vt.parentId === null)
    .flatMap((type) => {
      if (!type.isGroup) return priced.has(type.id) ? [{ type, subtypes: [] }] : [];
      const subtypes = catalog.filter((c) => c.parentId === type.id && priced.has(c.id));
      return subtypes.length > 0 ? [{ type, subtypes }] : [];
    });
}

/** Subcategory id → its vehicle's id, for the flow's chooseService event. */
export function parentMap(catalog: CatalogVehicleType[]): Record<string, string> {
  return Object.fromEntries(catalog.flatMap((vt) => (vt.parentId ? [[vt.id, vt.parentId]] : [])));
}
