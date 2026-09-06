import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("./embeddings", () => ({ embedQuery: vi.fn(), toVectorLiteral: vi.fn() }));

const { formatContextBlock, citationsFrom } = await import("./rag");

const chunks = [
  {
    chunkId: "c1",
    documentId: "d1",
    documentTitle: "Refund policy",
    index: 0,
    content: "30 days.",
    distance: 0.1,
  },
  {
    chunkId: "c2",
    documentId: "d1",
    documentTitle: "Refund policy",
    index: 1,
    content: "Exceptions.",
    distance: 0.2,
  },
  {
    chunkId: "c3",
    documentId: "d2",
    documentTitle: "Shipping",
    index: 0,
    content: "3-5 days.",
    distance: 0.3,
  },
];

describe("formatContextBlock", () => {
  it("returns empty string with no chunks", () => {
    expect(formatContextBlock([])).toBe("");
  });
  it("numbers sources and asks for inline citations", () => {
    const block = formatContextBlock(chunks);
    expect(block).toContain("[1]");
    expect(block).toContain("Refund policy");
    expect(block).toMatch(/cite/i);
  });
});

describe("citationsFrom", () => {
  it("de-duplicates by document", () => {
    const cites = citationsFrom(chunks);
    expect(cites).toHaveLength(2);
    expect(cites.map((c) => c.documentId)).toEqual(["d1", "d2"]);
  });
});
