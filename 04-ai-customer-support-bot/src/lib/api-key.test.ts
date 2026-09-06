import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { generateApiKey, hashKey, bearerFrom } = await import("./api-key");

describe("api-key helpers", () => {
  it("generates a prefixed key and a matching sha-256 hash", () => {
    const { raw, prefix, hashedKey } = generateApiKey();
    expect(raw.startsWith("sk_live_")).toBe(true);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(hashedKey).toBe(hashKey(raw));
    expect(hashedKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashing is deterministic and unique per key", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(hashKey(a.raw)).toBe(a.hashedKey);
    expect(a.hashedKey).not.toBe(b.hashedKey);
  });

  it("parses bearer tokens", () => {
    expect(bearerFrom("Bearer abc123")).toBe("abc123");
    expect(bearerFrom("bearer  xyz")).toBe("xyz");
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom("Basic abc")).toBeNull();
  });
});
