import { prisma } from "@/lib/db";
import { embedQuery, toVectorLiteral } from "./embeddings";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  index: number;
  content: string;
  distance: number;
}

export interface Citation {
  documentId: string;
  title: string;
  chunkIndex: number;
}

/**
 * Retrieve the top-k most similar knowledge-base chunks for `query`, scoped to
 * one organisation. Uses pgvector cosine distance (`<=>`) against the HNSW index.
 */
export async function retrieveContext(
  orgId: string,
  query: string,
  k = 5,
  maxDistance = 0.65,
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(query);
  const literal = toVectorLiteral(queryEmbedding);

  const rows = await prisma.$queryRaw<
    Array<{
      chunkId: string;
      documentId: string;
      documentTitle: string;
      index: number;
      content: string;
      distance: number;
    }>
  >`
    SELECT c.id            AS "chunkId",
           c."documentId"  AS "documentId",
           d.title         AS "documentTitle",
           c.index         AS "index",
           c.content       AS "content",
           (c.embedding <=> ${literal}::vector) AS "distance"
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE c."orgId" = ${orgId}
      AND c.embedding IS NOT NULL
      AND d.status = 'READY'
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${k}
  `;

  return rows.filter((r) => r.distance <= maxDistance);
}

/** Render retrieved chunks into a context block for the system prompt. */
export function formatContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const sources = chunks
    .map((c, i) => `[${i + 1}] (${c.documentTitle})\n${c.content}`)
    .join("\n\n---\n\n");
  return (
    `The user has a knowledge base. These excerpts were retrieved as possibly relevant ` +
    `to their message — use them when they help and cite as [1], [2], etc. If they are ` +
    `not relevant, ignore them and answer normally from your own knowledge.\n\n${sources}`
  );
}

export function citationsFrom(chunks: RetrievedChunk[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of chunks) {
    if (seen.has(c.documentId)) continue;
    seen.add(c.documentId);
    out.push({ documentId: c.documentId, title: c.documentTitle, chunkIndex: c.index });
  }
  return out;
}
