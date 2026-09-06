import { describe, it, expect } from "vitest";
import { buildSystemPrompt, trimHistory, DEFAULT_SYSTEM_PROMPT } from "./prompt";

describe("buildSystemPrompt", () => {
  it("falls back to the default prompt when the org prompt is blank", () => {
    const p = buildSystemPrompt({ orgSystemPrompt: "  " });
    expect(p).toContain(DEFAULT_SYSTEM_PROMPT.slice(0, 20));
    expect(p).toContain("Operating rules");
  });

  it("appends a context block when provided", () => {
    const p = buildSystemPrompt({ orgSystemPrompt: "Be nice.", contextBlock: "SOURCE: refunds" });
    expect(p).toContain("Be nice.");
    expect(p).toContain("SOURCE: refunds");
  });
});

describe("trimHistory", () => {
  it("keeps everything under budget", () => {
    const h = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
    ];
    expect(trimHistory(h, 1000)).toHaveLength(2);
  });

  it("drops the oldest turns past the budget but keeps at least the latest", () => {
    const h = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: "x".repeat(1000),
    }));
    const out = trimHistory(h, 3000);
    expect(out.length).toBeLessThan(20);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[out.length - 1]).toBe(h[h.length - 1]);
  });
});
