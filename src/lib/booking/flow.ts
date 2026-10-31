/**
 * Customer chat as a small state machine:
 *
 *   service → vehicle → (subtype) → day → time → details → done
 *
 * "subtype" only appears when the chosen vehicle has subcategories with a price for this
 * service (e.g. "Kamion stočar" → "1 sprat" / "2 sprata").
 *
 * Pure reducer, no data fetching — the component loads days/slots for the
 * current step and renders the transcript from this state. Events that don't
 * belong to the current step are ignored, so double taps and stale buttons
 * can't jump the flow.
 */
import type { VehicleType } from "../availability/pricing.ts";

export type Step = "service" | "vehicle" | "subtype" | "day" | "time" | "details" | "done";

export interface FlowState {
  step: Step;
  serviceId: string | null;
  vehicleTypeId: VehicleType | null;
  /** Vehicle was picked automatically because the service has a single price */
  vehicleAuto: boolean;
  /** Vehicle with subcategories the customer picked (or the only one), while/after choosing its subcategory */
  vehicleGroupId: string | null;
  /** The group was picked automatically: it's the only vehicle this service has prices for */
  groupAuto: boolean;
  /** Subcategory id → its vehicle's id, for the vehicle types this service has prices for */
  vehicleParents: Record<string, string>;
  date: string | null;
  slot: { time: string; startsAt: string } | null;
  /** Price list was opened from the welcome message */
  showPrices: boolean;
  /** One-off message shown in the current step, cleared by the next event */
  notice: string | null;
}

export type FlowEvent =
  | {
      type: "chooseService";
      serviceId: string;
      /** Vehicle types the service has a price for (subcategories, never their group) */
      vehicleTypeIds: VehicleType[];
      /** Subcategory id → its vehicle's id, for those of vehicleTypeIds that are subcategories */
      parents?: Record<string, string>;
    }
  | { type: "showPrices" }
  /** A vehicle without subcategories, or a vehicle group (then its subcategory is asked next) */
  | { type: "chooseVehicle"; vehicleTypeId: VehicleType }
  | { type: "chooseSubtype"; vehicleTypeId: VehicleType }
  | { type: "chooseDay"; date: string }
  | { type: "chooseSlot"; time: string; startsAt: string }
  | { type: "back" }
  | { type: "slotTaken" }
  | { type: "submitted" }
  | { type: "restart" };

export const initialFlow: FlowState = {
  step: "service",
  serviceId: null,
  vehicleTypeId: null,
  vehicleAuto: false,
  vehicleGroupId: null,
  groupAuto: false,
  vehicleParents: {},
  date: null,
  slot: null,
  showPrices: false,
  notice: null,
};

export const SLOT_TAKEN_NOTICE = "Taj termin je upravo zauzet. Izaberite drugi.";
export const NOT_BOOKABLE_NOTICE = "Ova usluga se ne zakazuje online. Pozovite nas za dogovor.";

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  const s = { ...state, notice: null };

  switch (event.type) {
    case "restart":
      return initialFlow;

    case "showPrices":
      return state.step === "service" ? { ...s, showPrices: true } : state;

    case "chooseService": {
      if (state.step !== "service") return state;
      if (event.vehicleTypeIds.length === 0) return { ...s, notice: NOT_BOOKABLE_NOTICE };
      const parents = event.parents ?? {};
      const base = { ...s, serviceId: event.serviceId, vehicleParents: parents, vehicleGroupId: null, groupAuto: false, date: null, slot: null };
      if (event.vehicleTypeIds.length === 1) {
        return { ...base, vehicleTypeId: event.vehicleTypeIds[0]!, vehicleAuto: true, step: "day" };
      }
      // Every option is a subcategory of the same vehicle: skip straight to choosing the subcategory.
      const groups = new Set(event.vehicleTypeIds.map((id) => parents[id] ?? id));
      const [onlyGroup] = groups;
      if (groups.size === 1 && onlyGroup && !event.vehicleTypeIds.includes(onlyGroup)) {
        return { ...base, vehicleTypeId: null, vehicleAuto: false, vehicleGroupId: onlyGroup, groupAuto: true, step: "subtype" };
      }
      return { ...base, vehicleTypeId: null, vehicleAuto: false, step: "vehicle" };
    }

    case "chooseVehicle": {
      if (state.step !== "vehicle") return state;
      const isGroup = Object.values(state.vehicleParents).includes(event.vehicleTypeId);
      return isGroup
        ? { ...s, vehicleGroupId: event.vehicleTypeId, step: "subtype" }
        : { ...s, vehicleTypeId: event.vehicleTypeId, step: "day" };
    }

    case "chooseSubtype":
      return state.step === "subtype" && state.vehicleParents[event.vehicleTypeId] === state.vehicleGroupId
        ? { ...s, vehicleTypeId: event.vehicleTypeId, step: "day" }
        : state;

    case "chooseDay":
      return state.step === "day" ? { ...s, date: event.date, step: "time" } : state;

    case "chooseSlot":
      return state.step === "time" ? { ...s, slot: { time: event.time, startsAt: event.startsAt }, step: "details" } : state;

    case "slotTaken":
      return state.step === "details" ? { ...s, slot: null, step: "time", notice: SLOT_TAKEN_NOTICE } : state;

    case "submitted":
      return state.step === "details" ? { ...s, step: "done" } : state;

    case "back":
      switch (state.step) {
        case "vehicle":
          return { ...s, step: "service", serviceId: null, vehicleParents: {} };
        case "subtype":
          return state.groupAuto
            ? { ...s, step: "service", serviceId: null, vehicleGroupId: null, groupAuto: false, vehicleParents: {} }
            : { ...s, step: "vehicle", vehicleGroupId: null };
        case "day":
          if (state.vehicleAuto) return { ...s, step: "service", serviceId: null, vehicleTypeId: null, vehicleAuto: false, vehicleParents: {} };
          return state.vehicleGroupId ? { ...s, step: "subtype", vehicleTypeId: null } : { ...s, step: "vehicle", vehicleTypeId: null };
        case "time":
          return { ...s, step: "day", date: null };
        case "details":
          return { ...s, step: "time", slot: null };
        default:
          return state;
      }
  }
}
