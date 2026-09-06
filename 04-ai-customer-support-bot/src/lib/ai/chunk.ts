/**
 * Split a plain-text document into overlapping chunks for embedding.
 * Rough token budget: ~4 chars/token, so `maxChars` defaults to ~800 tokens.
 * Splits on paragraph boundaries first, then packs paragraphs greedily.
 */
export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 3200;
  const overlapChars = opts.overlapChars ?? 400;

  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = overlapChars > 0 ? trimmed.slice(-overlapChars) : "";
  };

  for (const para of paragraphs) {
    // A single paragraph larger than the budget is hard-split.
    if (para.length > maxChars) {
      if (current.trim()) flush();
      for (let i = 0; i < para.length; i += maxChars - overlapChars) {
        chunks.push(para.slice(i, i + maxChars).trim());
      }
      current = "";
      continue;
    }

    if ((current + "\n\n" + para).length > maxChars) flush();
    current = current ? current + "\n\n" + para : para;
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.length > 0);
}
