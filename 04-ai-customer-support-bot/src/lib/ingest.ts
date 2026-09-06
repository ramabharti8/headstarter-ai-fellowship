import { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { chunkText } from "@/lib/ai/chunk";
import { embedBatch, toVectorLiteral } from "@/lib/ai/embeddings";

export type SupportedType = "txt" | "md" | "pdf";

export function detectType(filename: string, mime: string): SupportedType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  if (lower.endsWith(".txt") || mime.startsWith("text/")) return "txt";
  return null;
}

export async function extractText(buffer: Buffer, type: SupportedType): Promise<string> {
  if (type === "pdf") {
    // Imported lazily so the PDF stack only loads when a PDF is uploaded.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  return buffer.toString("utf-8");
}

export interface IngestArgs {
  orgId: string;
  userId: string;
  title: string;
  type: SupportedType;
  byteSize: number;
  text: string;
}

/** Create the Document row, then chunk + embed synchronously. */
export async function ingestDocument(args: IngestArgs): Promise<{ documentId: string }> {
  const doc = await prisma.document.create({
    data: {
      orgId: args.orgId,
      title: args.title,
      sourceType: args.type,
      byteSize: args.byteSize,
      status: DocStatus.PROCESSING,
      createdBy: args.userId,
    },
  });

  try {
    const chunks = chunkText(args.text);
    if (chunks.length === 0) throw new Error("Document produced no text");

    const embeddings = await embedBatch(chunks);

    // pgvector columns can't be written through Prisma's typed API, so insert raw.
    for (let i = 0; i < chunks.length; i++) {
      const literal = toVectorLiteral(embeddings[i]);
      await prisma.$executeRaw`
        INSERT INTO "Chunk" ("id", "documentId", "orgId", "index", "content", "embedding", "createdAt")
        VALUES (gen_random_uuid(), ${doc.id}, ${args.orgId}, ${i}, ${chunks[i]}, ${literal}::vector, now())
      `;
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: { status: DocStatus.READY, chunkCount: chunks.length },
    });
    await prisma.usageEvent.create({
      data: { orgId: args.orgId, type: "ingest", retrievedDocs: chunks.length },
    });
    logger.info({ documentId: doc.id, chunks: chunks.length }, "document ingested");
  } catch (err) {
    logger.error({ err, documentId: doc.id }, "ingestion failed");
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        status: DocStatus.FAILED,
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }

  return { documentId: doc.id };
}

export async function deleteDocument(orgId: string, documentId: string): Promise<void> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, orgId } });
  if (!doc) return;
  await prisma.document.delete({ where: { id: documentId } }); // cascades to chunks
}
