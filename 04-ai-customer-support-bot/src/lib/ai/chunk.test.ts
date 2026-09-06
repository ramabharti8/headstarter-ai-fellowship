import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("returns [] for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    const out = chunkText("Hello world.\n\nSecond paragraph.");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("Second paragraph");
  });

  it("splits long documents into multiple overlapping chunks", () => {
    const para = "word ".repeat(400).trim(); // ~2000 chars
    const doc = Array.from({ length: 5 }, () => para).join("\n\n");
    const out = chunkText(doc, { maxChars: 1200, overlapChars: 200 });
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(1200 + 200);
  });

  it("hard-splits a single oversized paragraph", () => {
    const huge = "x".repeat(5000);
    const out = chunkText(huge, { maxChars: 1000, overlapChars: 100 });
    expect(out.length).toBeGreaterThanOrEqual(5);
  });
});
