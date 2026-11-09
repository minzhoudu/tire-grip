import { describe, expect, it } from "vitest";
import { adminBookingRequestSchema, bookingRequestSchema, fieldErrors } from "../src/lib/booking/request.ts";

const valid = {
  slug: "brzi-tocak",
  serviceId: "5b0a1c4e-8f1d-4d3a-9c2b-7e6f5a4b3c2d",
  vehicleTypeId: "c1d2e3f4-8f1d-4d3a-9c2b-7e6f5a4b3c2d",
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
    expect(bookingRequestSchema.safeParse({ ...valid, vehicleTypeId: "truck" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, startsAt: "sutra" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, note: "x".repeat(301) }).success).toBe(false);
  });
});

describe("adminBookingRequestSchema (the shop entering a booking itself)", () => {
  const base = {
    slug: "brzi-tocak",
    serviceId: "8b0c6c2e-6d4b-4b8e-9a8e-1f3c2d4e5f60",
    vehicleTypeId: "8b0c6c2e-6d4b-4b8e-9a8e-1f3c2d4e5f61",
    startsAt: "2026-11-10T09:00:00.000Z",
  };

  it("needs nothing about the customer", () => {
    const r = adminBookingRequestSchema.parse(base);
    expect(r).toMatchObject({ name: "", phone: null, vehicleLabel: "", note: "" });
  });

  it("normalizes a phone when one is given, and still rejects a wrong one", () => {
    expect(adminBookingRequestSchema.parse({ ...base, phone: "064 123 4567" }).phone).toBe("+381641234567");
    expect(adminBookingRequestSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
  });

  it("accepts a one-letter name (the chat still asks for two)", () => {
    expect(adminBookingRequestSchema.parse({ ...base, name: "M" }).name).toBe("M");
  });
});
