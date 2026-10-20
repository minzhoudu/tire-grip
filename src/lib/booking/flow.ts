/**
 * Customer chat as a small state machine:
 *
 *   service → vehicle → day → time → details → done
 *
 * Pure reducer, no data fetching — the component loads days/slots for the
 * current step and renders the transcript from this state. Events that don't
 * belong to the current step are ignored, so double taps and stale buttons
 * can't jump the flow.
 */
import type { VehicleType } from "../availability/pricing.ts";

export type Step = "service" | "vehicle" | "day" | "time" | "details" | "done";

export interface FlowState {
  step: Step;
  serviceId: string | null;
  vehicleTypeId: VehicleType | null;
  /** Vehicle was picked automatically because the service has a single price */
  vehicleAuto: boolean;
  date: string | null;
  slot: { time: string; startsAt: string } | null;
  /** Price list was opened from the welcome message */
  showPrices: boolean;
  /** One-off message shown in the current step, cleared by the next event */
  notice: string | null;
}

export type FlowEvent =
  | { type: "chooseService"; serviceId: string; vehicleTypeIds: VehicleType[] }
  | { type: "showPrices" }
  | { type: "chooseVehicle"; vehicleTypeId: VehicleType }
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
      const auto = event.vehicleTypeIds.length === 1;
      return {
        ...s,
        serviceId: event.serviceId,
        vehicleTypeId: auto ? event.vehicleTypeIds[0]! : null,
        vehicleAuto: auto,
        step: auto ? "day" : "vehicle",
        date: null,
        slot: null,
      };
    }

    case "chooseVehicle":
      return state.step === "vehicle" ? { ...s, vehicleTypeId: event.vehicleTypeId, step: "day" } : state;

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
          return { ...s, step: "service", serviceId: null };
        case "day":
          return state.vehicleAuto
            ? { ...s, step: "service", serviceId: null, vehicleTypeId: null, vehicleAuto: false }
            : { ...s, step: "vehicle", vehicleTypeId: null };
        case "time":
          return { ...s, step: "day", date: null };
        case "details":
          return { ...s, step: "time", slot: null };
        default:
          return state;
      }
  }
}
