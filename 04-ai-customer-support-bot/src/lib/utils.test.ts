import { describe, it, expect } from "vitest";
import { slugify, cn } from "./utils";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Support Inc")).toBe("acme-support-inc");
  });
  it("strips leading/trailing punctuation and caps length", () => {
    expect(slugify("  !!Hello!!  ")).toBe("hello");
    expect(slugify("a".repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe("cn", () => {
  it("merges conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
