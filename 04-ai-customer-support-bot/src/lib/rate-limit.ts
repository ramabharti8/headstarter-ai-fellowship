import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by Postgres (one upsert per request).
 * Good enough for a single-region deploy; swap for Upstash Redis if you need
 * multi-region or sub-second precision.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
}

export async function rateLimit(
  identifier: string,
  limit: number,
  windowSec = 60,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSec * 1000)) * windowSec * 1000);
  const key = `${identifier}:${windowStart.getTime()}`;

  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  const resetAt = windowStart.getTime() + windowSec * 1000;
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));

  return {
    ok: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    limit,
    retryAfterSec,
  };
}

/** Throw a 429 AppError if the limit is exceeded. */
export async function enforceRateLimit(identifier: string, limit: number, windowSec = 60) {
  const result = await rateLimit(identifier, limit, windowSec);
  if (!result.ok) throw Errors.rateLimited(result.retryAfterSec);
  return result;
}

/** Best-effort cleanup of stale windows; call from a cron or occasionally. */
export async function pruneRateLimits(olderThanSec = 3600) {
  const cutoff = new Date(Date.now() - olderThanSec * 1000);
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
}
