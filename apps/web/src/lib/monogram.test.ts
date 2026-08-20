import { describe, expect, it } from "vitest";
import { monogram } from "./monogram";

describe("monogram", () => {
  it("uses the first letter of a plain name", () => {
    expect(monogram("Orbit Dynamics")).toBe("O");
  });

  it("skips a leading emoji instead of splitting its surrogate pair", () => {
    // Regression: "🥽 Plastic Labs"[0] is half a surrogate pair, which
    // serializes differently on the server and the client and breaks
    // hydration on every page that shows the logo.
    expect(monogram("🥽 Plastic Labs")).toBe("P");
  });

  it("keeps a whole code point when the name has no letters or digits", () => {
    expect(monogram("🥽")).toBe("🥽");
  });

  it("supports non-latin names", () => {
    expect(monogram("яндекс")).toBe("Я");
    expect(monogram("7bridges")).toBe("7");
  });

  it("falls back to ? for empty input", () => {
    expect(monogram("")).toBe("?");
    expect(monogram("   ")).toBe("?");
  });
});
