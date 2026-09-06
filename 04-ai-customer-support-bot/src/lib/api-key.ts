import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const PREFIX = "sk_live_";

/** Generate a new API key. The raw value is shown to the user exactly once. */
export function generateApiKey(): { raw: string; prefix: string; hashedKey: string } {
  const raw = PREFIX + randomBytes(24).toString("base64url");
  return { raw, prefix: raw.slice(0, 12), hashedKey: hashKey(raw) };
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface ResolvedKey {
  apiKeyId: string;
  orgId: string;
}

/**
 * Look up an org by a bearer key. Returns null for unknown or revoked keys.
 * Updates `lastUsedAt` opportunistically (best-effort, non-blocking).
 */
export async function resolveApiKey(raw: string | undefined | null): Promise<ResolvedKey | null> {
  if (!raw || !raw.startsWith(PREFIX)) return null;
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey: hashKey(raw) },
    select: { id: true, orgId: true, revokedAt: true },
  });
  if (!key || key.revokedAt) return null;

  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { apiKeyId: key.id, orgId: key.orgId };
}

export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
