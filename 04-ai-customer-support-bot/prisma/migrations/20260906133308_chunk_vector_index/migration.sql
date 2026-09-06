-- Approximate-nearest-neighbour index for RAG retrieval over Chunk.embedding.
-- HNSW (pgvector >= 0.5) needs no training step and gives good recall.
-- cosine distance (`<=>`) matches how we compare embeddings in lib/ai/rag.ts.
CREATE INDEX IF NOT EXISTS "chunk_embedding_hnsw_idx"
  ON "Chunk"
  USING hnsw ("embedding" vector_cosine_ops);