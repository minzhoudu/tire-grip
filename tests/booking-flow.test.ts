import { describe, expect, it } from "vitest";
import {
  type FlowEvent,
  type FlowState,
  NOT_BOOKABLE_NOTICE,
  SLOT_TAKEN_NOTICE,
  flowReducer,
  initialFlow,
} from "../src/lib/booking/flow.ts";

const run = (...events: FlowEvent[]): FlowState => events.reduce(flowReducer, initialFlow);

const swap: FlowEvent = { type: "chooseService", serviceId: "svc-swap", vehicleTypeIds: ["car", "suv", "van"] };
const car: FlowEvent = { type: "chooseVehicle", vehicleTypeId: "car" };
const friday: FlowEvent = { type: "chooseDay", date: "2026-10-23" };
const slot: FlowEvent = { type: "chooseSlot", time: "08:30", startsAt: "2026-10-23T06:30:00.000Z" };

describe("happy path", () => {
  it("service → vehicle → day → time → details → done", () => {
    expect(run(swap).step).toBe("vehicle");
    expect(run(swap, car).step).toBe("day");
    expect(run(swap, car, friday).step).toBe("time");
    const details = run(swap, car, friday, slot);
    expect(details.step).toBe("details");
    expect(details).toEqual({
      ...initialFlow,
      step: "details",
      serviceId: "svc-swap",
      vehicleTypeId: "car",
      date: "2026-10-23",
      slot: { time: "08:30", startsAt: "2026-10-23T06:30:00.000Z" },
    });
    expect(run(swap, car, friday, slot, { type: "submitted" }).step).toBe("done");
  });

  it("skips the vehicle question when the service has a single price", () => {
    const s = run({ type: "chooseService", serviceId: "svc-repair", vehicleTypeIds: ["car"] });
    expect(s.step).toBe("day");
    expect(s.vehicleTypeId).toBe("car");
    expect(s.vehicleAuto).toBe(true);
  });

  it("a service that can't be booked online stays on the service step with a notice", () => {
    const s = run({ type: "chooseService", serviceId: "svc-storage", vehicleTypeIds: [] });
    expect(s.step).toBe("service");
    expect(s.serviceId).toBeNull();
    expect(s.notice).toBe(NOT_BOOKABLE_NOTICE);
  });

  it("the price list can be opened from the first step", () => {
    expect(run({ type: "showPrices" }).showPrices).toBe(true);
    expect(run({ type: "showPrices" }, swap).showPrices).toBe(true);
  });
});

describe("going back", () => {
  it("each step goes back one and clears that answer", () => {
    expect(run(swap, car, friday, slot, { type: "back" })).toMatchObject({ step: "time", slot: null, date: "2026-10-23" });
    expect(run(swap, car, friday, { type: "back" })).toMatchObject({ step: "day", date: null, vehicleTypeId: "car" });
    expect(run(swap, car, { type: "back" })).toMatchObject({ step: "vehicle", vehicleTypeId: null });
    expect(run(swap, { type: "back" })).toMatchObject({ step: "service", serviceId: null });
  });

  it("back from day returns to services when the vehicle was automatic", () => {
    const s = run({ type: "chooseService", serviceId: "svc-repair", vehicleTypeIds: ["car"] }, { type: "back" });
    expect(s).toMatchObject({ step: "service", serviceId: null, vehicleTypeId: null, vehicleAuto: false });
  });

  it("back does nothing on the first and last step", () => {
    expect(run({ type: "back" })).toEqual(initialFlow);
    const done = run(swap, car, friday, slot, { type: "submitted" });
    expect(flowReducer(done, { type: "back" })).toBe(done);
  });
});

describe("guards against stale or double taps", () => {
  it("ignores events that don't belong to the current step", () => {
    const atVehicle = run(swap);
    expect(flowReducer(atVehicle, friday)).toBe(atVehicle);
    expect(flowReducer(atVehicle, slot)).toBe(atVehicle);
    expect(flowReducer(atVehicle, { type: "submitted" })).toBe(atVehicle);
    expect(flowReducer(atVehicle, { type: "chooseService", serviceId: "other", vehicleTypeIds: ["car"] })).toBe(atVehicle);
    expect(flowReducer(atVehicle, { type: "showPrices" })).toBe(atVehicle);
  });

  it("a double tap on a day only moves one step", () => {
    const s = run(swap, car, friday, friday);
    expect(s.step).toBe("time");
  });
});

describe("slot taken while filling in the form", () => {
  it("returns to the slot list with a notice, keeping the day", () => {
    const s = run(swap, car, friday, slot, { type: "slotTaken" });
    expect(s).toMatchObject({ step: "time", slot: null, date: "2026-10-23", notice: SLOT_TAKEN_NOTICE });
  });

  it("the notice disappears with the next choice", () => {
    const s = run(swap, car, friday, slot, { type: "slotTaken" }, slot);
    expect(s.notice).toBeNull();
    expect(s.step).toBe("details");
  });
});

it("restart clears everything", () => {
  expect(run(swap, car, friday, slot, { type: "submitted" }, { type: "restart" })).toEqual(initialFlow);
});
