import { embed, embedMany } from "ai";
import { env } from "@/lib/env";
import { embeddingModel, EMBEDDING_DIM } from "./provider";

/** Postgres `vector` literal, e.g. `[0.12,-0.03,...]`. */
export function toVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIM) {
    throw new Error(`Expected ${EMBEDDING_DIM}-dim embedding, got ${values.length}`);
  }
  return `[${values.join(",")}]`;
}

/**
 * Google's embedding models (gemini-embedding-001) support a configurable
 * output dimensionality that the pinned AI SDK version does not expose, and we
 * need it to match the pgvector column width (HNSW caps at 2000 dims). So for
 * the Google provider we call the REST endpoint directly; other providers go
 * through the AI SDK.
 */
async function googleEmbed(texts: string[]): Promise<number[][]> {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const model = `models/${env.AI_EMBEDDING_MODEL}`;
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY;

  const res = await fetch(`${base}/${model}:batchEmbedContents?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIM,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google embedding failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { embeddings: Array<{ values: number[] }> };
  return json.embeddings.map((e) => e.values);
}

export async function embedQuery(text: string): Promise<number[]> {
  if (env.AI_PROVIDER === "google") return (await googleEmbed([text]))[0];
  const { embedding } = await embed({ model: embeddingModel(), value: text });
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (env.AI_PROVIDER === "google") {
    // Keep request bodies reasonable for large documents.
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      out.push(...(await googleEmbed(texts.slice(i, i + 100))));
    }
    return out;
  }
  const { embeddings } = await embedMany({ model: embeddingModel(), values: texts });
  return embeddings;
}
