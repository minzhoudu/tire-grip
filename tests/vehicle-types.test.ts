import { describe, expect, it } from "vitest";
import { bookableVehicleTypeIds, buildVehicleCatalog, parentMap, vehicleChoices, vehicleTypeLabel, type VehicleTypeRow } from "../src/lib/vehicle-types.ts";

const row = (id: string, label: string, sortOrder: number, over: Partial<VehicleTypeRow> = {}): VehicleTypeRow => ({
  id,
  label,
  sortOrder,
  parentId: null,
  icon: null,
  isActive: true,
  ...over,
});

const rows: VehicleTypeRow[] = [
  row("truck", "Kamion stočar", 2, { icon: "🚚" }),
  row("car", "Putničko", 1, { icon: "🚗" }),
  row("f2", "2 sprata", 5, { parentId: "truck" }),
  row("f1", "1 sprat", 4, { parentId: "truck" }),
  row("f3", "3 sprata", 6, { parentId: "truck", isActive: false }),
];

describe("buildVehicleCatalog", () => {
  it("lists each type followed by its active subcategories, in the shop's order", () => {
    expect(buildVehicleCatalog(rows).map((vt) => vt.id)).toEqual(["car", "truck", "f1", "f2"]);
  });

  it("gives subcategories a full label and the parent's icon, and marks the parent as a group", () => {
    const catalog = buildVehicleCatalog(rows);
    expect(catalog.find((vt) => vt.id === "f2")).toEqual({
      id: "f2",
      parentId: "truck",
      name: "2 sprata",
      label: "Kamion stočar · 2 sprata",
      icon: "🚚",
      isGroup: false,
    });
    expect(catalog.find((vt) => vt.id === "truck")?.isGroup).toBe(true);
    expect(catalog.find((vt) => vt.id === "car")?.isGroup).toBe(false);
  });

  it("a switched-off type hides its subcategories too", () => {
    const off = rows.map((r) => (r.id === "truck" ? { ...r, isActive: false } : r));
    expect(buildVehicleCatalog(off).map((vt) => vt.id)).toEqual(["car"]);
  });

  it("stays a group when all its subcategories are switched off, so it never becomes bookable by accident", () => {
    const allOff = rows.map((r) => (r.parentId ? { ...r, isActive: false } : r));
    const catalog = buildVehicleCatalog(allOff);
    expect(catalog.find((vt) => vt.id === "truck")?.isGroup).toBe(true);
    expect([...bookableVehicleTypeIds(catalog)]).toEqual(["car"]);
  });
});

describe("vehicleChoices", () => {
  const catalog = buildVehicleCatalog(rows);

  it("offers plain vehicles and groups with at least one priced subcategory", () => {
    const choices = vehicleChoices(catalog, ["f2", "car", "f1"]);
    expect(choices.map((c) => [c.type.id, c.subtypes.map((s) => s.id)])).toEqual([
      ["car", []],
      ["truck", ["f1", "f2"]],
    ]);
  });

  it("leaves out a group with no priced subcategory, and unpriced vehicles", () => {
    expect(vehicleChoices(catalog, ["f1"]).map((c) => c.type.id)).toEqual(["truck"]);
    expect(vehicleChoices(catalog, ["car"]).map((c) => c.type.id)).toEqual(["car"]);
    expect(vehicleChoices(catalog, [])).toEqual([]);
  });
});

describe("helpers", () => {
  it("parentMap maps subcategories to their vehicle", () => {
    expect(parentMap(buildVehicleCatalog(rows))).toEqual({ f1: "truck", f2: "truck" });
  });

  it("vehicleTypeLabel", () => {
    expect(vehicleTypeLabel("2 sprata", "Kamion stočar")).toBe("Kamion stočar · 2 sprata");
    expect(vehicleTypeLabel("Putničko", null)).toBe("Putničko");
  });
});
