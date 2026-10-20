import { describe, expect, it } from "vitest";
import { bookingRequestSchema, fieldErrors } from "../src/lib/booking/request.ts";

const valid = {
  slug: "brzi-tocak",
  serviceId: "5b0a1c4e-8f1d-4d3a-9c2b-7e6f5a4b3c2d",
  vehicleType: "car",
  startsAt: "2026-10-23T06:30:00.000Z",
  name: "  Marko  ",
  phone: "064 123 4567",
};

describe("bookingRequestSchema", () => {
  it("trims, normalizes the phone and fills defaults", () => {
    const r = bookingRequestSchema.parse(valid);
    expect(r.name).toBe("Marko");
    expect(r.phone).toBe("+381641234567");
    expect(r.vehicleLabel).toBe("");
    expect(r.note).toBe("");
    expect(r.reminderConsent).toBe(false);
  });

  it("reports readable errors per field", () => {
    const r = bookingRequestSchema.safeParse({ ...valid, name: "M", phone: "123" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errors = fieldErrors(r.error);
    expect(errors.name).toBe("Unesite ime");
    expect(errors.phone).toBe("Unesite ispravan broj telefona, npr. 064 123 4567");
  });

  it("rejects tampered ids, vehicle types and dates", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, serviceId: "1; drop table" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, vehicleType: "truck" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, startsAt: "sutra" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, note: "x".repeat(301) }).success).toBe(false);
  });
});
