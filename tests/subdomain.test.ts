import { describe, expect, it } from "vitest";
import { subdomainOf } from "../src/lib/subdomain.ts";

describe("subdomainOf", () => {
  it("returns null for the bare and www root domains", () => {
    expect(subdomainOf("mojvulkanizer.com")).toBeNull();
    expect(subdomainOf("www.mojvulkanizer.com")).toBeNull();
    expect(subdomainOf("localhost:3000")).toBeNull();
  });

  it("extracts the shop or platform subdomain", () => {
    expect(subdomainOf("brzi-tocak.mojvulkanizer.com")).toBe("brzi-tocak");
    expect(subdomainOf("platform.mojvulkanizer.com")).toBe("platform");
    expect(subdomainOf("brzi-tocak.localhost:3000")).toBe("brzi-tocak");
  });

  it("returns null for an unrecognized host (e.g. a Vercel preview URL)", () => {
    expect(subdomainOf("tire-grip-git-feature.vercel.app")).toBeNull();
    expect(subdomainOf(null)).toBeNull();
  });
});
