import { describe, expect, it } from "vitest";
import { toLatin } from "../src/lib/translit.ts";

describe("toLatin", () => {
  it("transliterates Serbian Cyrillic place and street names", () => {
    expect(toLatin("Краљево")).toBe("Kraljevo");
    expect(toLatin("Булевар ослобођења")).toBe("Bulevar oslobođenja");
    expect(toLatin("Чачак")).toBe("Čačak");
    expect(toLatin("Џорџа Вашингтона")).toBe("Džordža Vašingtona");
    expect(toLatin("Његошева 12а")).toBe("Njegoševa 12a");
  });

  it("keeps all-caps digraphs all caps, and leaves Latin text alone", () => {
    expect(toLatin("ЉУБОВИЈА")).toBe("LJUBOVIJA");
    expect(toLatin("Novi Sad, Kneza Miloša 5")).toBe("Novi Sad, Kneza Miloša 5");
  });
});
