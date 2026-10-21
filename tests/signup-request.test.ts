import { describe, expect, it } from "vitest";
import { signupRequestSchema } from "../src/lib/signup/request.ts";

const valid = {
  shopName: "Brzi Točak",
  slug: "brzi-tocak",
  city: "Kragujevac",
  ownerName: "Marko Marković",
  email: "vlasnik@example.rs",
  password: "dovoljno-duga-lozinka",
  phone: "064 123 4567",
};

describe("signupRequestSchema", () => {
  it("trims and normalizes, defaults city to empty", () => {
    const r = signupRequestSchema.parse({ ...valid, city: undefined });
    expect(r.city).toBe("");
    expect(r.phone).toBe("+381641234567");
  });

  it("rejects reserved slugs (they'd collide with {slug}.mojvulkanizer.com routing)", () => {
    for (const slug of ["platform", "www", "admin", "api"]) {
      const r = signupRequestSchema.safeParse({ ...valid, slug });
      expect(r.success).toBe(false);
    }
  });

  it("accepts an ordinary slug", () => {
    expect(signupRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a slug with uppercase or invalid characters", () => {
    expect(signupRequestSchema.safeParse({ ...valid, slug: "Brzi_Tocak" }).success).toBe(false);
  });
});
